# CineFlow para Android

App nativa en Kotlin y Jetpack Compose. Usa la misma cuenta de CineFlow y solicita cambios al backend autenticado de Vercel; la app no contiene una clave administrativa de Supabase.

## Compilar

Abre `android/` en Android Studio, selecciona un JDK 17 o 21 e instala Android SDK 35. Ejecuta `./gradlew assembleDebug` en Linux/macOS o `gradlew.bat assembleDebug` en Windows.

El APK de prueba queda en `app/build/outputs/apk/debug/app-debug.apk`. La app requiere Android 7 o posterior y conexión a Internet.

## Funciones nativas conectadas

- Inicio de sesión de CineFlow.
- Inicio con conteo de proyectos y solicitudes pendientes.
- Directorio del equipo por productora, con puestos cinematográficos disponibles.
- Creación y edición de proyectos con permisos comprobados por el servidor.
- Solicitudes de acceso y salida, con revisión del propietario.
- Seguimiento del proyecto con tareas, actividad y chat.
- Registro personal de entrada y salida, notas e historial de jornadas.
- Actualización periódica cuando la app está en primer plano.

## Módulos por integrar

El código web también contiene agenda, rodaje, centro de trabajo, reportes, invitaciones, ajustes de productora y administración global de usuarios. Esos módulos todavía requieren endpoints móviles dedicados antes de habilitarlos en Android. Los cambios están aislados en `feature/native-android-complete` y no alteran la rama principal.
