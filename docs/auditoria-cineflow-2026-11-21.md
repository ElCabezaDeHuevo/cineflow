# Auditoría inicial de CineFlow Studio

Fecha: 2026-11-21 (la consulta de Supabase devolvió observaciones fechadas 2026-11-22 UTC).
Repositorio: ElCabezaDeHuevo/cineflow
Rama base: main
Commit base de producción identificado: 609d251c9795c011e1cd52a410801c54c10615a6
Rama aislada de auditoría/mejoras: audit/premium-upgrade-2026-11-21

## Alcance y límites

Se inspeccionó el código del repositorio y se consultó en modo lectura el esquema PostgreSQL real y los asesores de Supabase del proyecto Cineflow (ref: hhfiupszhzhmivmbvpou). No se modificó producción, no se ejecutaron migraciones, no se cambiaron políticas, datos, variables ni configuración de Vercel. Esta auditoría es estática y de metadatos; no sustituye pruebas end-to-end ni una revisión de datos reales.

## Correcciones importantes frente a la auditoría preliminar

La comparación directa con el esquema real corrige dos alertas preliminares:
- `public.projects.organization_id` SÍ existe en Supabase.
- `public.work_sessions.deleted_at` SÍ existe en Supabase.
- La política de lectura de `work_sessions` NO es `USING (true)`: la política efectiva `users read own attendance or technical admin` limita lectura al propio usuario o al administrador técnico mediante `app_metadata.cineflow_role`.
Por tanto, esos tres puntos no deben tratarse como vulnerabilidades o discrepancias confirmadas. La diferencia observada es que los SQL versionados del repositorio no representan el esquema completo actual.

## Hallazgos confirmados

### Seguridad — prioridad alta
1. El asesor de Supabase detecta 8 tablas con RLS habilitado pero sin políticas: `billing_events`, `error_reports`, `organization_manual_payments`, `project_assignment_requests`, `project_leave_requests`, `project_membership_requests`, `project_task_deletion_requests`, `project_task_files`. Esto deniega acceso por RLS a roles de API sin política, pero se debe revisar el flujo esperado y los privilegios/grants antes de decidir si falta una política o si el acceso debe permanecer exclusivamente del lado servidor.
2. El asesor detecta que `public.is_project_member(uuid,text[])` es SECURITY DEFINER y ejecutable por authenticated vía RPC. Revisar si debe moverse a un esquema privado y/o restringir EXECUTE; conservar su uso interno en políticas mediante una función segura en esquema no expuesto. No cambiar sin verificar dependencias.
3. La protección de contraseñas filtradas de Supabase Auth está desactivada. Evaluar activarla desde configuración tras revisar impacto en altas y restablecimientos.
4. Las políticas RLS de `work_sessions` y tablas principales usan autorización sensible; mantener decisiones basadas en `app_metadata`, nunca en `user_metadata` editable por el usuario.

### Rendimiento — prioridad media
El asesor de Supabase reporta:
- 11 políticas RLS con llamadas a `auth.uid()` / `auth.jwt()` que pueden optimizarse mediante `(select auth.uid())` o `(select auth.jwt())` cuando sea semánticamente correcto.
- Varias claves foráneas sin índices de cobertura, incluyendo referencias en `project_tasks`, `projects`, `project_messages`, `project_notifications`, `project_task_files` y `work_sessions`.
- 5 casos de políticas permisivas múltiples en tablas de organizaciones, gastos y agenda.
- 1 par de índices duplicados en `subscriptions`; no borrar hasta confirmar consultas y uso.
- 14 índices marcados como no usados; no borrar sin observar carga representativa.
El asesor de salud devolvió cero hallazgos.

### Aplicación / experiencia
- `app/RouteAutoRefresh.tsx` implementa refresco periódico; medir antes de reemplazarlo. Migrar pantallas concretas a Supabase Realtime o invalidación selectiva solo donde aporte valor.
- `app/page.tsx` genera URLs firmadas para portadas; revisar patrón de consultas y expiración para evitar solicitudes repetidas.
- `app/layout.tsx` contiene un log de depuración con datos de usuario/roles; retirar o sanitizar en producción.
- `app/globals.css` contiene reglas repetidas y conviene normalizar tipografía y tokens visuales.
- Mantener login, administración, empresas, miembros, proyectos, timeline, tareas, asistencia, solicitudes, archivos, actividad, reportes y panel de administración.

## Plan propuesto (sin ejecutar todavía)

1. **Línea base y protección:** confirmar ramas/deployments, registrar commit de producción, respaldar esquema y configuración relevante, preparar pruebas de regresión y verificar que Preview use entorno de prueba separado de producción.
2. **Seguridad Supabase:** inspeccionar grants y dependencias de las ocho tablas sin políticas; revisar RPC SECURITY DEFINER; optimizar políticas RLS; evaluar protección de contraseñas filtradas. Preparar migraciones revisables, no SQL directo en producción.
3. **Calidad de datos y rendimiento:** inventariar índices/FK y consultas reales; priorizar índices faltantes; revisar refresco periódico y generación de imágenes firmadas.
4. **Sistema visual premium:** definir tokens, tipografía, componentes y estados; rediseñar shell/sidebar, dashboard, proyectos, formularios, tablas, modales, login y móvil sin cambiar contratos de datos ni permisos.
5. **Mejoras funcionales:** mejorar calendario/rodaje, timeline, Kanban, notificaciones y comentarios, solo tras mapear pantallas y contratos existentes.
6. **Validación:** lint, typecheck, build, pruebas de autenticación y roles (admin, owner, producer, member, viewer), RLS por organización/proyecto, formularios, carga de archivos, asistencia y responsive.
7. **Lanzamiento:** Preview primero; revisión explícita; producción únicamente tras aprobación.

## Criterios de no regresión

- No borrar ni alterar proyectos, usuarios, empresas, membresías o archivos existentes.
- No cambiar roles ni claims de usuarios sin autorización expresa.
- No modificar datos ni esquema de producción desde esta rama.
- No cambiar secretos ni variables de entorno.
- No fusionar a main ni promover Preview a producción sin aprobación.
- Mantener posibilidad de rollback al deployment anterior.

## Estado

- Rama creada desde `main`: `audit/premium-upgrade-2026-11-21`.
- Auditoría de código y esquema real: inicial completada.
- Cambios funcionales/visuales: no iniciados.
- Producción y base de datos: sin modificaciones realizadas.
