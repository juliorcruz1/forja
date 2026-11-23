#!/usr/bin/env python3
"""Descargador Twitch / Kick.

Uso:
    python descargador.py                         -> abre la ventana
    python descargador.py LINK                    -> descarga directo
    python descargador.py LINK 1:20:00 1:21:30    -> solo ese tramo del VOD

Requisitos:
    pip install -U "yt-dlp[default,curl-cffi]"
    ffmpeg en el PATH
"""

import importlib.util
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


def carpeta_salida(plataforma):
    carpeta = Path.home() / "Descargas" / "Clips" / plataforma
    carpeta.mkdir(parents=True, exist_ok=True)
    return carpeta


def armar_comando(link, plataforma, tipo, carpeta, desde="", hasta=""):
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--no-playlist", "--newline", "--merge-output-format", "mp4",
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

def abrir_ventana():
    import queue
    import tkinter as tk
    from tkinter import ttk

    root = tk.Tk()
    root.title(TITULO)
    root.geometry("640x460")
    root.minsize(480, 360)

    cola = queue.Queue()
    estado = {"descargando": False}

    marco = ttk.Frame(root, padding=16)
    marco.pack(fill="both", expand=True)

    ttk.Label(marco, text="Pega el link:").pack(anchor="w")
    var_link = tk.StringVar()
    entrada = ttk.Entry(marco, textvariable=var_link)
    entrada.pack(fill="x", pady=(4, 4), ipady=3)

    lbl_det = tk.Label(marco, text="Esperando link...", fg="gray", anchor="w")
    lbl_det.pack(fill="x")

    # Tiempos (solo VOD)
    marco_vod = ttk.Frame(marco)
    ttk.Label(marco_vod, text="Desde (h:mm:ss)").pack(side="left")
    var_desde = tk.StringVar()
    ttk.Entry(marco_vod, textvariable=var_desde, width=10).pack(side="left", padx=(6, 16))
    ttk.Label(marco_vod, text="Hasta").pack(side="left")
    var_hasta = tk.StringVar()
    ttk.Entry(marco_vod, textvariable=var_hasta, width=10).pack(side="left", padx=(6, 0))

    marco_boton = ttk.Frame(marco)
    marco_boton.pack(fill="x", pady=(10, 10))
    boton = ttk.Button(marco_boton, text="Descargar")
    boton.pack()

    marco_log = ttk.Frame(marco)
    marco_log.pack(fill="both", expand=True)
    log = tk.Text(marco_log, height=10, wrap="word", state="disabled",
                  font=("Consolas", 9) if sys.platform == "win32" else ("Monospace", 9))
    barra = ttk.Scrollbar(marco_log, command=log.yview)
    log.configure(yscrollcommand=barra.set)
    barra.pack(side="right", fill="y")
    log.pack(side="left", fill="both", expand=True)

    def actualizar_deteccion(*_):
        texto = var_link.get().strip()
        det = detectar(texto)
        if not texto:
            lbl_det.config(text="Esperando link...", fg="gray")
        elif det:
            lbl_det.config(text=f"Detectado: {det[0]} - {det[1]}", fg="#1a8f3a")
        else:
            lbl_det.config(text="Link no reconocido", fg="#c62828")
        if det and det[1] == "VOD":
            if not marco_vod.winfo_ismapped():
                marco_vod.pack(fill="x", pady=(8, 0), before=marco_boton)
        else:
            marco_vod.pack_forget()

    var_link.trace_add("write", actualizar_deteccion)

    def escribir_log(linea, reemplazar=False):
        log.configure(state="normal")
        if reemplazar:
            log.delete("end-2l linestart", "end-1c")
        log.insert("end", linea + "\n")
        log.see("end")
        log.configure(state="disabled")

    ultimo = {"progreso": False}

    def revisar_cola():
        try:
            while True:
                item = cola.get_nowait()
                if item is None:
                    estado["descargando"] = False
                    boton.state(["!disabled"])
                    continue
                # Las líneas de progreso se sobreescriben para no llenar el cuadro.
                es_prog = item.startswith("[download]") and "%" in item
                escribir_log(item, reemplazar=es_prog and ultimo["progreso"])
                ultimo["progreso"] = es_prog
        except queue.Empty:
            pass
        root.after(100, revisar_cola)

    def iniciar(*_):
        if estado["descargando"]:
            return
        link = var_link.get().strip()
        log.configure(state="normal")
        log.delete("1.0", "end")
        log.configure(state="disabled")
        ultimo["progreso"] = False
        if not detectar(link):
            escribir_log(MSG_NO_RECONOZCO)
            return
        estado["descargando"] = True
        boton.state(["disabled"])
        desde, hasta = var_desde.get(), var_hasta.get()

        def trabajo():
            try:
                descargar(link, desde, hasta, escribir=cola.put)
            except Exception:
                cola.put(MSG_FALLO)
            finally:
                cola.put(None)

        threading.Thread(target=trabajo, daemon=True).start()

    boton.config(command=iniciar)
    root.bind("<Return>", iniciar)
    entrada.focus_set()
    root.after(150, entrada.focus_force)
    root.after(100, revisar_cola)
    root.mainloop()


# ---------------------------------------------------------------- Consola

def main(args):
    if not args:
        abrir_ventana()
        return 0
    link = args[0]
    desde = args[1] if len(args) > 1 else ""
    hasta = args[2] if len(args) > 2 else ""
    return 0 if descargar(link, desde, hasta) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
