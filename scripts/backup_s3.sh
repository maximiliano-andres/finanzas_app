#!/bin/bash

# =======================================================================================
# SCRIPT DE RESPALDO AUTOMÁTICO (BASE DE DATOS Y ARCHIVOS PDF) + CARGA A AWS S3 (PLANTILLA)
# =======================================================================================
# Este script realiza un volcado de la base de datos PostgreSQL en el contenedor Docker,
# comprime las carpetas de archivos adjuntos (PDFs) y opcionalmente sube los archivos
# a un Bucket de AWS S3.
# =======================================================================================

# --- CONFIGURACIÓN DE VARIABLES PRINCIPALES ---

# Nombre del contenedor Docker de PostgreSQL (debe coincidir con container_name en docker-compose)
DB_CONTAINER="flujopago-postgres"

# Nombre de la base de datos a respaldar
DB_NAME="flujopago_db"

# Usuario administrador de PostgreSQL
DB_USER="postgres"

# Carpeta local en el servidor donde se guardarán temporalmente los respaldos
BACKUP_DIR="./backups"

# Formato de fecha para nombrar los archivos de backup de forma única (Ej: 20260709_233000)
FECHA=$(date +"%Y%m%d_%H%M%S")

# Número de días que se mantendrán los respaldos locales antes de eliminarse automáticamente
KEEP_DAYS=15

# --- [CONFIGURACIÓN AWS S3] ---
# NOTA: Descomentar y completar estas variables cuando se configure el acceso a AWS S3.
# BUCKET_S3="mi-bucket-de-respaldos-flujopago"
# AWS_REGION="us-east-1"


# --- INICIO DEL PROCESO DE RESPALDO ---

echo "=== Iniciando proceso de respaldo: $FECHA ==="

# 1. Asegurar que la carpeta local de respaldos exista
# Si no existe, la crea recursivamente.
mkdir -p "$BACKUP_DIR"

# 2. Respaldo de la Base de Datos PostgreSQL
# docker exec: ejecuta el comando dentro del contenedor activo flujopago-postgres
# pg_dump: utilidad nativa de PostgreSQL para extraer la estructura y datos
# gzip: comprime la salida para reducir significativamente el espacio en disco (.sql.gz)
echo "Respaldando base de datos $DB_NAME desde el contenedor $DB_CONTAINER..."
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$BACKUP_DIR/db_backup_$FECHA.sql.gz"

# Comprobar si el comando anterior falló
if [ $? -eq 0 ]; then
    echo "¡Respaldo de base de datos completado con éxito!"
else
    echo "ERROR: Falló el respaldo de la base de datos" >&2
fi

# 3. Respaldo de los archivos físicos (PDFs firmados y de autorización de la app)
# tar -czf: crea un archivo comprimido (.tar.gz)
# Incluye las rutas locales de PDFs: ./PDF_autorizaciones y ./PDF_firmados
echo "Respaldando archivos PDF adjuntos..."
tar -czf "$BACKUP_DIR/pdfs_backup_$FECHA.tar.gz" ./PDF_autorizaciones ./PDF_firmados 2>/dev/null

# Comprobar si la compresión de archivos falló
if [ $? -eq 0 ]; then
    echo "¡Compresión de PDFs completada con éxito!"
else
    echo "ERROR: Falló la compresión de los archivos PDF" >&2
fi


# --- [OPCIÓN 2: SINCRONIZACIÓN A AWS S3 (PLANTILLA PARA EL CLIENTE)] ---
# =======================================================================================
# INSTRUCCIONES PARA EL CLIENTE:
# 1. Instale la CLI de AWS en el servidor: 'sudo apt install awscli' (o similar según OS)
# 2. Configure sus credenciales con: 'aws configure' (ingrese Access Key, Secret Key y Región)
# 3. Descomente las siguientes líneas quitando el símbolo '#' del inicio.
# =======================================================================================

# echo "Cargando archivos de respaldo a la nube (AWS S3)..."
# export AWS_DEFAULT_REGION="$AWS_REGION"

# Sube el backup de la base de datos al bucket de S3 configurado
# aws s3 cp "$BACKUP_DIR/db_backup_$FECHA.sql.gz" "s3://$BUCKET_S3/backups/db/db_backup_$FECHA.sql.gz"

# Sube el backup de los PDFs al bucket de S3 configurado
# aws s3 cp "$BACKUP_DIR/pdfs_backup_$FECHA.tar.gz" "s3://$BUCKET_S3/backups/pdfs/pdfs_backup_$FECHA.tar.gz"

# if [ $? -eq 0 ]; then
#     echo "¡Carga a AWS S3 completada con éxito!"
# else
#     echo "ERROR: Falló la carga de respaldos a AWS S3" >&2
# fi


# --- LIMPIEZA DE RESPALDOS LOCALES ANTIGUOS ---

# find: busca en la carpeta de backups local
# -mtime +$KEEP_DAYS: busca archivos modificados hace más días que el límite establecido
# -delete: elimina los archivos encontrados que coincidan con la condición
echo "Eliminando respaldos locales con antigüedad mayor a $KEEP_DAYS días..."
find "$BACKUP_DIR" -type f \( -name "db_backup_*.sql.gz" -o -name "pdfs_backup_*.tar.gz" \) -mtime +"$KEEP_DAYS" -delete

echo "=== Proceso de respaldo finalizado: $(date) ==="


# =======================================================================================
# CÓMO CONFIGURAR ESTA TAREA AUTOMÁTICAMENTE (CRONTAB) EN EL SERVIDOR HOST:
# =======================================================================================
# 1. Abra el editor de tareas programadas de Linux:
#    crontab -e
#
# 2. Añada la siguiente línea al final del archivo para ejecutar el script todos los días
#    a las 02:00 AM (Asegúrese de poner la ruta absoluta correcta de la carpeta del proyecto):
#
#    0 2 * * * cd /ruta/absoluta/a/FlujoPago && bash ./scripts/backup_s3.sh >> ./logs/backup_cron.log 2>&1
# =======================================================================================
