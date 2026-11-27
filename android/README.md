# CineFlow para Android

App nativa en Kotlin y Jetpack Compose. Usa las cuentas y proyectos de
CineFlow a través de las rutas autenticadas `/api/android`.

## Compilar

Abre `android/` en Android Studio, selecciona un JDK 17 o 21 e instala
Android SDK 35. Ejecuta `./gradlew assembleDebug` en Linux/macOS o
`gradlew.bat assembleDebug` en Windows.

El APK de prueba queda en `app/build/outputs/apk/debug/app-debug.apk`.
La app requiere Android 7 o posterior y conexión a Internet.

## Alcance de la primera versión

- Inicio de sesión por correo y contraseña de CineFlow.
- Proyectos de las productoras activas de la cuenta.
- Solicitudes de ingreso y salida, con aprobación o rechazo del dueño.
- Actualización automática cada ocho segundos con la app en primer plano.

La sesión se conserva en memoria y vuelve a pedirse al cerrar el proceso o
cuando vence el token. Si la cuenta requiere cambiar la contraseña, completa
ese paso desde la web. El APK de depuración está preparado para pruebas directas.
