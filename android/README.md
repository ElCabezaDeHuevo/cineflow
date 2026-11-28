# CineFlow para Android

Aplicacion Android nativa en Kotlin y Jetpack Compose, conectada a las mismas cuentas de CineFlow.

## Funciones disponibles en esta iteracion

- Inicio de sesion y sincronizacion de datos desde CineFlow.
- Panel de inicio con resumen de proyectos y solicitudes.
- Lista, busqueda, creacion y edicion de proyectos con acceso por productora.
- Solicitudes de acceso o salida, con aprobacion y rechazo.
- Seguimiento de proyecto, tareas, actividad y chat.
- Registro personal de entrada y salida, historial y horas.
- Directorio del equipo por productora, puestos cinematograficos y proyectos asociados.
- Calendario de entregas, tareas pendientes e inicios de proyecto, con acceso al seguimiento.
- Perfil y cierre de sesion.

## Servidor y acceso a datos

La app usa rutas `/api/android/*` y no incluye una clave de servicio de Supabase. Los permisos y el alcance de productora se validan en el servidor. Para mantener el despliegue actual sin cambios, el trabajo esta en la rama `feature/native-android-complete`.

## Funciones pendientes para paridad completa

Aun falta implementar en Android la administracion de productoras, invitaciones, asignacion y aprobacion de puestos, control de horarios del equipo, gestion de rodaje y escenas, reportes, suscripciones y panel de administracion global. El calendario muestra fechas de proyecto y vencimientos de tareas disponibles en la API actual.

## Referencias de código abierto

Se revisaron patrones de interfaz y arquitectura de [Now in Android](https://github.com/android/nowinandroid) y las [muestras oficiales de Jetpack Compose](https://github.com/android/compose-samples), ambas bajo Apache 2.0, además de [Unitask](https://github.com/CondaLabs/unitask), bajo MIT. Se tomaron como referencia; no se copió su código ni sus recursos.

## Abrir y compilar

Abre esta carpeta en Android Studio. Gradle requiere el JDK incluido con Android Studio y un SDK Android configurado. El identificador de aplicacion se mantiene como `com.cineflow.app`.

