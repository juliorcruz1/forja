#!/usr/bin/env python3
"""Descargador Twitch / Kick.

Uso:
    python descargador.py                         -> abre la ventana
    python descargador.py LINK                    -> descarga directo
    python descargador.py LINK 1:20:00 1:21:30    -> solo ese tramo del VOD

Requisitos:
    pip install -U "yt-dlp[default,curl-cffi]" customtkinter
    ffmpeg en el PATH
"""

import importlib.util
import os
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path

TITULO = "Descargador Twitch / Kick"
PLANTILLA = "%(uploader)s - %(title).80s [%(id)s].%(ext)s"

MSG_NO_RECONOZCO = "No reconozco ese link"
MSG_FALTA_YTDLP = "Falta yt-dlp. Corre: pip install -U yt-dlp"
MSG_KICK = 'Para Kick instala: pip install -U "yt-dlp[default,curl-cffi]"'
MSG_FALLO = "Falló la descarga. Actualiza yt-dlp: pip install -U yt-dlp"
MSG_FALTA_CTK = "Falta customtkinter. Corre: pip install -U customtkinter"
MSG_FFMPEG = "Falta ffmpeg en el PATH: https://ffmpeg.org/download.html"
MSG_FFMPEG_VIEJO = ("Tu ffmpeg es muy viejo para recortar VODs de Twitch. "
                    "Actualízalo: https://ffmpeg.org/download.html")

# Orden importa: Clip y VOD antes que Live.
_UUID = r"[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}"
_PRE = r"^(?:https?://)?(?:www\.|m\.)?"
PATRONES = [
    ("Twitch", "Clip", _PRE + r"clips\.twitch\.tv/(?:embed\?clip=)?[\w-]+"),
    ("Twitch", "Clip", _PRE + r"twitch\.tv/\w+/clip/[\w-]+"),
    ("Twitch", "VOD", _PRE + r"twitch\.tv/videos/\d+"),
    ("Kick", "Clip", _PRE + r"kick\.com/[\w-]+/clips/clip_[\w-]+"),
    ("Kick", "Clip", _PRE + r"kick\.com/[\w-]+/?\?(?:[^#]*&)?clip=clip_[\w-]+"),
    ("Kick", "VOD", _PRE + r"kick\.com/video/(" + _UUID + r")"),
    ("Kick", "VOD", _PRE + r"kick\.com/[\w-]+/videos/" + _UUID),
    ("Twitch", "Live", _PRE + r"twitch\.tv/\w+/?(?:[?#].*)?$"),
    ("Kick", "Live", _PRE + r"kick\.com/[\w-]+/?(?:[?#].*)?$"),
]
PATRONES = [(p, t, re.compile(rx, re.IGNORECASE)) for p, t, rx in PATRONES]


def detectar(link):
    """Devuelve (plataforma, tipo) o None."""
    link = (link or "").strip()
    for plataforma, tipo, rx in PATRONES:
        if rx.search(link):
            return plataforma, tipo
    return None


def normalizar(link):
    """Ajusta el link a una forma que yt-dlp entiende."""
    link = link.strip()
    if not re.match(r"^https?://", link, re.IGNORECASE):
        link = "https://" + link
    # yt-dlp solo reconoce kick.com/USUARIO/videos/UUID; el usuario no se usa.
    m = re.search(r"kick\.com/video/(" + _UUID + ")", link, re.IGNORECASE)
    if m:
        link = "https://kick.com/video/videos/" + m.group(1).lower()
    return link


def tiempo_valido(t):
    return bool(re.fullmatch(r"(\d+:)?(\d+:)?\d+(\.\d+)?", t))


def version_ffmpeg():
    """Versión mayor de ffmpeg (0 si no se sabe), o None si no está."""
    if not shutil.which("ffmpeg"):
        return None
    try:
        out = subprocess.run(["ffmpeg", "-version"], capture_output=True,
                             text=True, timeout=15).stdout
    except (OSError, subprocess.SubprocessError):
        return 0
    m = re.search(r"ffmpeg version \D*(\d+)\.", out)
    return int(m.group(1)) if m else 0


_RX_PROGRESO = re.compile(
    r"^\[download\]\s+(?P<pct>\d+(?:\.\d+)?)%"
    r"(?:.*?\bat\s+(?P<vel>~?\s*[\d.]+\s*\w+/s))?"
    r"(?:.*?\bETA\s+(?P<eta>[\d:]+))?")


def leer_progreso(linea):
    """De '[download]  42.3% of ... at 5MiB/s ETA 00:12' saca
    (0.423, '5MiB/s', '00:12'). Devuelve None si no es línea de progreso."""
    m = _RX_PROGRESO.match(linea.strip())
    if not m:
        return None
    vel = re.sub(r"\s+", "", m.group("vel") or "").lstrip("~")
    return min(float(m.group("pct")) / 100, 1.0), vel, m.group("eta") or ""


def abrir_carpeta(carpeta):
    carpeta = Path(carpeta)
    carpeta.mkdir(parents=True, exist_ok=True)
    if sys.platform == "win32":
        os.startfile(str(carpeta))
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(carpeta)])
    else:
        subprocess.Popen(["xdg-open", str(carpeta)])


def carpeta_salida(plataforma):
    carpeta = Path.home() / "Descargas" / "Clips" / plataforma
    carpeta.mkdir(parents=True, exist_ok=True)
    return carpeta


def armar_comando(link, plataforma, tipo, carpeta, desde="", hasta=""):
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--no-playlist", "--newline", "--merge-output-format", "mp4",
        "--concurrent-fragments", "4",
        "-o", str(carpeta / PLANTILLA),
    ]
    if tipo == "VOD" and (desde or hasta):
        cmd += ["--download-sections", f"*{desde or '0'}-{hasta or 'inf'}",
                "--force-keyframes-at-cuts"]
    if plataforma == "Twitch" and tipo == "Live":
        cmd.append("--live-from-start")
    if plataforma == "Kick":
        cmd += ["--impersonate", "chrome"]
    cmd.append(normalizar(link))
    return cmd


def descargar(link, desde="", hasta="", escribir=print):
    """Descarga el link. Llama a escribir(linea) con cada línea de progreso.
    Devuelve True si terminó bien."""
    det = detectar(link)
    if not det:
        escribir(MSG_NO_RECONOZCO)
        return False
    plataforma, tipo = det
    desde, hasta = (desde or "").strip(), (hasta or "").strip()
    for t in (desde, hasta):
        if t and not tiempo_valido(t):
            escribir(f"Tiempo inválido: {t}  (usa h:mm:ss)")
            return False

    if importlib.util.find_spec("yt_dlp") is None:
        escribir(MSG_FALTA_YTDLP)
        return False
    if plataforma == "Kick" and importlib.util.find_spec("curl_cffi") is None:
        escribir(MSG_KICK)
        return False

    ver = version_ffmpeg()
    if ver is None:
        escribir(MSG_FFMPEG)
        return False
    # ffmpeg 6.x se cuelga al saltar dentro de los VODs de Twitch (HLS fMP4).
    if plataforma == "Twitch" and tipo == "VOD" and (desde or hasta) and 0 < ver < 7:
        escribir(MSG_FFMPEG_VIEJO)
        return False

    carpeta = carpeta_salida(plataforma)
    cmd = armar_comando(link, plataforma, tipo, carpeta, desde, hasta)
    escribir(f"Detectado: {plataforma} - {tipo}")

    salida = []
    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", bufsize=1,
        )
        for linea in proc.stdout:
            linea = linea.rstrip()
            if linea:
                salida.append(linea)
                escribir(linea)
        proc.wait()
    except OSError:
        escribir(MSG_FALLO)
        return False

    if proc.returncode == 0:
        escribir(f"Listo. Guardado en: {carpeta}")
        return True

    texto = "\n".join(salida[-30:]).lower()
    if "no module named yt_dlp" in texto:
        escribir(MSG_FALTA_YTDLP)
    elif plataforma == "Kick" and "impersonat" in texto:
        escribir(MSG_KICK)
    else:
        escribir(MSG_FALLO)
    return False


# ---------------------------------------------------------------- Ventana

VERDE, ROJO, GRIS = "#4ade80", "#f87171", "#9ca3af"


def abrir_ventana():
    import queue
    try:
        import customtkinter as ctk
    except ImportError:
        print(MSG_FALTA_CTK)
        return 1

    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("blue")

    root = ctk.CTk()
    root.title(TITULO)
    root.geometry("560x520")
    root.minsize(460, 440)

    cola = queue.Queue()
    estado = {"descargando": False, "texto": None,
              "carpeta": Path.home() / "Descargas" / "Clips"}

    marco = ctk.CTkFrame(root, fg_color="transparent")
    marco.pack(fill="both", expand=True, padx=20, pady=16)

    ctk.CTkLabel(marco, text=TITULO, font=ctk.CTkFont(size=20, weight="bold")
                 ).pack(anchor="w", pady=(0, 12))

    entrada = ctk.CTkEntry(marco, placeholder_text="Pega el link aquí",
                           height=42, corner_radius=10, font=ctk.CTkFont(size=14))
    entrada.pack(fill="x")

    # CTkEntry borra el texto de ejemplo al recibir el foco; como el cursor
    # arranca aquí, lo dejamos visible hasta que se escriba o pegue algo.
    try:
        def _foco(_e):
            entrada._is_focused = True

        def _quitar_ejemplo(e=None):
            if e is None or getattr(e, "char", ""):
                entrada._deactivate_placeholder()

        entrada._entry.bind("<FocusIn>", _foco)
        entrada._entry.bind("<KeyPress>", _quitar_ejemplo, add="+")
        entrada._entry.bind("<<Paste>>", lambda e: _quitar_ejemplo(), add="+")
    except AttributeError:
        pass

    lbl_det = ctk.CTkLabel(marco, text="Esperando link...", text_color=GRIS, anchor="w")
    lbl_det.pack(fill="x", pady=(4, 0))

    # Tiempos (solo VOD)
    marco_vod = ctk.CTkFrame(marco, fg_color="transparent")
    ctk.CTkLabel(marco_vod, text="Desde (h:mm:ss)").pack(side="left")
    ent_desde = ctk.CTkEntry(marco_vod, width=90, corner_radius=8, placeholder_text="0:00:00")
    ent_desde.pack(side="left", padx=(8, 18))
    ctk.CTkLabel(marco_vod, text="Hasta").pack(side="left")
    ent_hasta = ctk.CTkEntry(marco_vod, width=90, corner_radius=8, placeholder_text="fin")
    ent_hasta.pack(side="left", padx=(8, 0))

    marco_botones = ctk.CTkFrame(marco, fg_color="transparent")
    marco_botones.pack(pady=(14, 10))
    boton = ctk.CTkButton(marco_botones, text="Descargar", width=220, height=44,
                          corner_radius=12, font=ctk.CTkFont(size=15, weight="bold"))
    boton.pack()
    boton_carpeta = ctk.CTkButton(
        marco_botones, text="Abrir carpeta", width=220, height=30, corner_radius=10,
        fg_color="transparent", border_width=1, border_color=GRIS, text_color=("gray20", "gray85"),
        hover_color=("gray80", "gray25"))
    boton_carpeta.pack(pady=(8, 0))

    marco_prog = ctk.CTkFrame(marco, fg_color="transparent")
    marco_prog.pack(fill="x", pady=(2, 8))
    barra = ctk.CTkProgressBar(marco_prog, height=12, corner_radius=6)
    barra.pack(side="left", fill="x", expand=True)
    color_barra = barra.cget("progress_color")

    def poner_barra(valor):
        # En 0 CTkProgressBar dibuja un punto; lo ocultamos.
        barra.configure(progress_color=color_barra if valor > 0 else barra.cget("fg_color"))
        barra.set(valor)

    poner_barra(0)
    lbl_prog = ctk.CTkLabel(marco_prog, text="", width=150, anchor="e",
                            text_color=GRIS, font=ctk.CTkFont(size=12))
    lbl_prog.pack(side="left", padx=(10, 0))

    log = ctk.CTkTextbox(marco, corner_radius=10, wrap="word",
                         font=ctk.CTkFont(family="Consolas" if sys.platform == "win32"
                                          else "monospace", size=11))
    log.pack(fill="both", expand=True)
    log.configure(state="disabled")

    def actualizar_deteccion():
        texto = entrada.get().strip()
        if texto == estado["texto"]:
            return
        estado["texto"] = texto
        det = detectar(texto)
        if not texto:
            lbl_det.configure(text="Esperando link...", text_color=GRIS)
        elif det:
            lbl_det.configure(text=f"Detectado: {det[0]} - {det[1]}", text_color=VERDE)
        else:
            lbl_det.configure(text="Link no reconocido", text_color=ROJO)
        if det and det[1] == "VOD":
            if not marco_vod.winfo_ismapped():
                marco_vod.pack(anchor="w", pady=(8, 0), before=marco_botones)
        else:
            marco_vod.pack_forget()

    def escribir_log(linea):
        log.configure(state="normal")
        log.insert("end", linea + "\n")
        log.see("end")
        log.configure(state="disabled")

    def revisar_cola():
        actualizar_deteccion()
        try:
            while True:
                item = cola.get_nowait()
                if isinstance(item, tuple):  # fin: (ok,)
                    estado["descargando"] = False
                    boton.configure(state="normal")
                    if item[0]:
                        poner_barra(1)
                        lbl_prog.configure(text="Listo", text_color=VERDE)
                    else:
                        lbl_prog.configure(text="Error", text_color=ROJO)
                    continue
                prog = leer_progreso(item)
                if prog:
                    pct, vel, eta = prog
                    poner_barra(pct)
                    partes = [f"{pct * 100:.0f}%"]
                    if vel:
                        partes.append(vel)
                    if eta:
                        partes.append(f"ETA {eta}")
                    lbl_prog.configure(text="  ".join(partes), text_color=GRIS)
                else:
                    escribir_log(item)
        except queue.Empty:
            pass
        root.after(100, revisar_cola)

    def iniciar(*_):
        if estado["descargando"]:
            return
        link = entrada.get().strip()
        log.configure(state="normal")
        log.delete("1.0", "end")
        log.configure(state="disabled")
        poner_barra(0)
        lbl_prog.configure(text="")
        det = detectar(link)
        if not det:
            escribir_log(MSG_NO_RECONOZCO)
            return
        estado["descargando"] = True
        estado["carpeta"] = Path.home() / "Descargas" / "Clips" / det[0]
        boton.configure(state="disabled")
        desde, hasta = ent_desde.get(), ent_hasta.get()

        def trabajo():
            ok = False
            try:
                ok = descargar(link, desde, hasta, escribir=cola.put)
            except Exception:
                cola.put(MSG_FALLO)
            finally:
                cola.put((ok,))

        threading.Thread(target=trabajo, daemon=True).start()

    def abrir(*_):
        try:
            abrir_carpeta(estado["carpeta"])
        except OSError:
            escribir_log(f"No pude abrir la carpeta: {estado['carpeta']}")

    boton.configure(command=iniciar)
    boton_carpeta.configure(command=abrir)
    root.bind("<Return>", iniciar)
    entrada.focus_set()
    root.after(150, entrada.focus_force)
    root.after(100, revisar_cola)
    root.mainloop()
    return 0


# ---------------------------------------------------------------- Consola

def main(args):
    if not args:
        return abrir_ventana()
    link = args[0]
    desde = args[1] if len(args) > 1 else ""
    hasta = args[2] if len(args) > 2 else ""
    return 0 if descargar(link, desde, hasta) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
