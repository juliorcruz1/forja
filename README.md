# FORJA

> Construir tu carácter mediante pequeñas acciones constantes.

App de hábitos y crecimiento personal para usar todos los días desde el iPhone (PWA instalable).
Todo vive en tu dispositivo: no hay servidor, cuentas ni servicios de pago.

**Etapa 1 incluye:** Inicio, Hábitos buenos y malos, Diario, Estadísticas, Ajustes con respaldo JSON,
revisión semanal y PWA instalable con despliegue en GitHub Pages.

---

## 1. Ejecutarla en tu computadora (Windows)

Solo necesitas hacerlo una vez para probarla. Para usarla en el iPhone salta a la sección 2.

1. Instala **Node.js** (versión 22 o más nueva) desde <https://nodejs.org> → botón "LTS" → siguiente, siguiente, finalizar.
2. Abre la carpeta del proyecto en el Explorador de archivos, haz clic en la barra de dirección, escribe `powershell` y presiona Enter.
3. En la ventana azul escribe, uno por uno:

   ```powershell
   npm install
   npm run dev
   ```

4. Abre en el navegador la dirección que aparece: <http://localhost:5173/forja/>
5. Para detenerla, vuelve a la ventana de PowerShell y presiona `Ctrl + C`.

Otros comandos útiles:

| Comando | Para qué sirve |
|---|---|
| `npm test` | Corre las pruebas automáticas |
| `npm run build` | Genera la versión final en la carpeta `dist` |
| `npm run preview` | Abre esa versión final en <http://localhost:4173/forja/> |
| `npm run icons` | Regenera los íconos a partir del logo (`src/brand/logoSvg.ts`) |

> `localhost` no sirve para instalarla en el iPhone: el iPhone necesita una dirección **HTTPS**. Para eso está GitHub Pages.

---

## 2. Publicarla gratis con GitHub Pages

### 2.1 Crear el repositorio y subir el código

1. Crea una cuenta en <https://github.com> si no tienes.
2. Crea un repositorio **público** llamado exactamente `forja` (botón **New** → nombre `forja` → Public → *Create repository*). No marques "Add a README".
3. En PowerShell, dentro de la carpeta del proyecto:

   ```powershell
   git remote add origin https://github.com/TU-USUARIO/forja.git
   git push -u origin main
   ```

   La primera vez se abrirá una ventana para iniciar sesión en GitHub.

   Si tienes GitHub CLI (`gh`), puedes hacer todo en un paso: `gh auth login` y luego
   `gh repo create forja --public --source . --push`.

### 2.2 Activar GitHub Pages

1. En tu repositorio entra a **Settings → Pages**.
2. En **Build and deployment → Source** elige **GitHub Actions**.
3. Ve a la pestaña **Actions**: verás "Deploy a GitHub Pages" corriendo. Cuando tenga palomita verde (1–2 minutos), tu app estará en:

   **`https://TU-USUARIO.github.io/forja/`**

Cada vez que hagas `git push` a `main`, la app se vuelve a publicar sola (primero corre las pruebas).

---

## 3. Instalarla en el iPhone

1. Abre **Safari** (tiene que ser Safari) y entra a `https://TU-USUARIO.github.io/forja/`.
2. Toca el botón **Compartir** (cuadro con flecha hacia arriba).
3. Desliza y toca **Añadir a pantalla de inicio** → **Añadir**.
4. Abre FORJA desde el ícono de las llamas: se abre a pantalla completa, sin barra de Safari, y funciona sin internet.

### Respaldos (importante)

Tus datos viven **solo en ese iPhone** (no en GitHub ni en la nube).

- Una vez por semana ve a **Más → Respaldo de datos → Exportar** y guarda el archivo en **Archivos** o **iCloud Drive**.
- Para recuperarlos (teléfono nuevo, borraste la app): **Importar** y elige el archivo. La app te pide confirmar antes de reemplazar.
- La app te recuerda hacer el respaldo cuando pasan más de 7 días.
- **Nunca subas tus respaldos al repositorio** (es público). El `.gitignore` ya bloquea los nombres de archivo de respaldo.

### Limitaciones de iPhone

- No hay alarmas ni notificaciones push confiables sin servidor: la app usa recordatorios **dentro de la app** (noche crítica, "Hoy toca volver", aviso de respaldo).
- Si borras la app de la pantalla de inicio o los datos de Safari, se borran los datos: por eso el respaldo.

---

## Cómo funciona

- **Hábitos:** frecuencia diaria, días específicos o X veces por semana (con días planeados que se pueden mover cada semana). Cada hábito tiene versión mínima, frase de identidad, hábito previo (stacking), obligatorio u opcional, pausa y archivo.
- **Estados por día:** pendiente, completo, mínimo, saltado o descanso. Los días de descanso y no programados no cuentan ni rompen rachas; *saltado* sí cuenta como no cumplido.
- **Metas semanales (gym):** un día planeado que no hiciste no es un fallo mientras la meta de la semana siga alcanzable.
- **Extras:** los hábitos opcionales nunca cuentan como fallo; suman como "+1 extra".
- **Porcentaje del día:** obligatorios cumplidos (completo o mínimo) ÷ obligatorios programados ese día.
- **Hábitos malos:** modo "días sin", con mejor marca, tira de 14 días y recaídas editables.
- **Noches críticas:** si al día siguiente entras antes de la hora configurada (por defecto 6:00 AM), el Inicio te sugiere acostarte antes (por defecto 9:00 PM).
- Rachas, porcentajes y estadísticas **siempre se calculan a partir de los registros**; nunca se guardan por separado.

## Estructura del código

```
src/
  config/brand.ts      ← nombre, lema y textos de marca (único lugar)
  config/defaults.ts   ← horario y hábitos iniciales (editables en la app)
  brand/logoSvg.ts     ← logo SVG reutilizable (pirámide de 6 llamas)
  db/                  ← Dexie (IndexedDB) con esquema versionado, repositorio y respaldo
  domain/              ← lógica pura: hábitos, rachas, metas, malos, sueño, estadísticas
  lib/dates.ts         ← fechas locales YYYY-MM-DD, semana inicia en lunes
  screens/             ← pantallas
  components/          ← componentes de interfaz
```

Para cambiar el esquema de datos en el futuro: agrega `this.version(2)` en `src/db/db.ts` con su `.upgrade()`,
sube `SCHEMA_VERSION` y añade el paso correspondiente en `MIGRATIONS` de `src/db/backup.ts`.

Tecnología: React + TypeScript + Vite + Tailwind CSS + Dexie + vite-plugin-pwa + Vitest.
