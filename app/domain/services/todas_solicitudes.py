from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, insert, update
from app.infrastructure.security.hashing import hash_password

from app.domain.models.tabla_todas_solicitudes import Tabla_Todas_Solicitudes
from app.domain.models.tabla_recepcionados import Tabla_Recepcionados
from app.domain.models.tabla_historico import TablaHistorico
from app.domain.dto.todas_solicitudesDTO import Todas_SolicitudesIn
from app.domain.services.historico_service import registrar_cambio_historico
from app.infrastructure.utils.logger_personalizado import setup_logger

from typing import Optional

logger = setup_logger("TODAS_SOLICITUDES_SERVICE")

async def check_folio_exists_global(folio: str, session: AsyncSession, 
                                 exclude_solicitud_id: Optional[int] = None, 
                                 exclude_recepcionado_id: Optional[int] = None,
                                 solicitante_context: Optional[str] = None,
                                 empresa_context: Optional[str] = None):
    """
    Verifica la unicidad de un folio a nivel global en todas las tablas del sistema (solicitudes y recepcionados).
    
    Reglas de negocio y lógica de control de folios duplicados:
    1. Si el folio es un marcador vacío o de visualización (ej: '-', '0', 's/n'), se ignora (no se valida unicidad).
    2. Busca el folio tanto en la columna consolidada `folio` (que puede contener strings directos o listados JSON) 
       como en los campos de folios individuales (`folio_uno` a `folio_cinco`).
    3. Permite duplicados bajo una excepción: si el folio coincide en registros históricos o solicitudes existentes 
       pero pertenece al mismo solicitante y a la misma empresa (indicando un reingreso o corrección legítima del mismo caso).
       - Para esto, normaliza los textos colapsando espacios dobles y convirtiéndolos a mayúsculas.
    
    Riesgos de modificación:
    - Alterar la lógica de normalización de cadenas de texto puede provocar falsos positivos de duplicados 
      (impidiendo reingresos de folios válidos) o falsos negativos (permitiendo fraudes o folios duplicados reales).
      
    Args:
        folio (str): El folio a verificar.
        session (AsyncSession): Sesión asíncrona de base de datos.
        exclude_solicitud_id (int, opcional): ID de solicitud a omitir en las búsquedas (para actualizaciones).
        exclude_recepcionado_id (int, opcional): ID de recepcionado a omitir.
        solicitante_context (str, opcional): Solicitante que realiza la petición, para verificar la excepción de coincidencia.
        empresa_context (str, opcional): Empresa asociada al contexto de la petición.
        
    Returns:
        Tuple[bool, str]:
            - bool: True si el folio ya está registrado y viola la regla de unicidad, False de lo contrario.
            - str: Mensaje detallado indicando dónde se localizó el duplicado o cadena vacía si no existe.
    """
    import orjson

    # Ignorar cadenas de marcador de posición (visualización frontend)
    PLACEHOLDERS = ["MÚLTIPLES FOLIOS", "MULTIPLES FOLIOS", "MÚLTIPLE", "MULTIPLE", "MÚLTIPLES MONTOS", "MULTIPLES MONTOS", "-", "Sin folio"]
    if not folio or str(folio).strip() in PLACEHOLDERS:
        return False, ""
    
    # Configuración de exclusión por tabla (Modelo, ID, nombre_columna_id)
    tablas_config = [
        (Tabla_Todas_Solicitudes, exclude_solicitud_id, "id"),
        (Tabla_Recepcionados, exclude_recepcionado_id, "id"),
        # En el histórico, el ID de origen puede ser tanto de solicitudes como de recepcionados
        (TablaHistorico, exclude_solicitud_id, "id_solicitud_origen"),
        (TablaHistorico, exclude_recepcionado_id, "id_solicitud_origen")
    ]
    
    for tabla, exclude_id, id_col_name in tablas_config:
        if exclude_id is None and id_col_name != "id":
             # Si no hay ID para excluir en una tabla que usa id_solicitud_origen, saltamos esta config específica
             # (Evita excluir erróneamente si se pasa None)
             if tabla == TablaHistorico: continue
             
        # Construir consulta base
        query = select(
            tabla.id, 
            tabla.folio,
            tabla.folio_uno,
            tabla.folio_dos,
            tabla.folio_tres,
            tabla.folio_cuatro,
            tabla.folio_cinco,
            tabla.solicitante if hasattr(tabla, 'solicitante') else None,
            tabla.empresa if hasattr(tabla, 'empresa') else None
        ).where(
            (tabla.folio.like(f"%{folio}%")) |
            (tabla.folio_uno == folio) |
            (tabla.folio_dos == folio) |
            (tabla.folio_tres == folio) |
            (tabla.folio_cuatro == folio) |
            (tabla.folio_cinco == folio)
        )
        
        # Excluir el registro actual o su rastro histórico si estamos en un update
        if exclude_id is not None:
            id_col = getattr(tabla, id_col_name)
            query = query.where(id_col != exclude_id)
            
        result = await session.execute(query)
        
        for row in result:
            # Validación Inteligente para Histórico
            if tabla == TablaHistorico and solicitante_context and empresa_context:
                # Validación Robusta (colapsa múltiples espacios y normaliza mayúsculas)
                def normalize(text):
                    return " ".join(str(text or "").split()).upper()

                row_solicitante = normalize(row.solicitante)
                row_empresa = normalize(row.empresa)
                ctx_solicitante = normalize(solicitante_context)
                ctx_empresa = normalize(empresa_context)
                if row_solicitante == ctx_solicitante and row_empresa == ctx_empresa:
                    # [DEBUG] logger.debug(f"Folio '{folio}' encontrado en histórico pero pertenece al mismo solicitante/empresa. Ignorando.")
                    continue

            # Verificación exacta en el campo general (que puede ser JSON)
            if row.folio:
                try:
                    existing_folios = orjson.loads(row.folio) if row.folio.startswith('[') else [row.folio]
                    if folio in existing_folios:
                        return True, f"El folio '{folio}' ya existe en {tabla.__tablename__}."
                except:
                    if row.folio == folio:
                        return True, f"El folio '{folio}' ya existe en {tabla.__tablename__}."
            
            # Verificación exacta en campos individuales
            if folio in [row.folio_uno, row.folio_dos, row.folio_tres, row.folio_cuatro, row.folio_cinco]:
                return True, f"El folio '{folio}' ya existe en {tabla.__tablename__} (detalle)."

    return False, ""


async def crear_todas_solicitudes_service(data: Todas_SolicitudesIn, session: AsyncSession):
    """
    Crea una nueva solicitud en el sistema (`Tabla_Todas_Solicitudes`) aplicando validaciones y reglas de negocio.
    
    Reglas de negocio y flujos implementados:
    1. Acepta el campo 'folio' como un string simple o como una lista de folios.
    2. Ejecuta una validación de duplicados global para cada folio de forma independiente.
    3. Auto-calcula el monto acumulado sumando los valores individuales de `monto_por_folio_uno` a `_cinco`.
    4. Fuerza el campo `tipo_solicitud` al valor inmutable "Mis Solicitudes".
    5. Guarda los folios en el campo consolidado `folio` serializándolos en JSON si son múltiples folios, 
       o como string directo si es uno solo, con fines de retrocompatibilidad en bases de datos externas.
    
    Consideraciones de desarrollo:
    - No modifique la lógica de suma de folios ya que puede provocar descuadres financieros.
    - El guardado consolidado del campo 'folio' debe ser compatible con la interfaz web y reportes.
    
    Args:
        data (Todas_SolicitudesIn): DTO con los datos de la solicitud validados por Pydantic.
        session (AsyncSession): Sesión asíncrona de base de datos activa.
        
    Returns:
        Tuple[Tabla_Todas_Solicitudes, Optional[str]]:
            - Tabla_Todas_Solicitudes: El objeto de la base de datos insertado (o None si hay error de validación).
            - str: Mensaje de error si falló alguna validación de folios, None en caso exitoso.
    """
    import orjson
    # Permitir folio como str o lista
    folios = data.folio
    if isinstance(folios, str):
        folios = [folios.strip()]
    else:
        folios = [str(f).strip() for f in folios if f]

    # Validar unicidad de cada folio en todas las tablas
    for folio in folios:
        existe, mensaje = await check_folio_exists_global(
            folio, 
            session,
            solicitante_context=data.solicitante,
            empresa_context=data.empresa
        )
        if existe:
            return None, mensaje

    # Guardar folios como JSON si es lista, o string si es solo uno (para retrocompatibilidad en campo folio)
    folio_db = orjson.dumps(folios).decode('utf-8') if len(folios) > 1 else folios[0]

    stmt = insert(Tabla_Todas_Solicitudes).values(
        usuario_id=data.usuario_id,
        solicitante=data.solicitante,
        fecha_solicitud=data.fecha_solicitud,
        folio=folio_db, # Restaurado para compatibilidad
        empresa=data.empresa,
        obra=data.obra, # Nuevo campo
        proceso=data.proceso,
        monto=sum(float(m) for m in [
            data.monto_por_folio_uno,
            data.monto_por_folio_dos,
            data.monto_por_folio_tres,
            data.monto_por_folio_cuatro,
            data.monto_por_folio_cinco
        ] if m is not None), # Auto-calcular monto
        estado=data.estado.upper(),
        reviso=data.reviso,
        mes_de_proceso=data.mes_de_proceso,
        anio=data.anio,
        cuenta_contable=data.cuenta_contable,
        auxiliar=data.auxiliar,
        fecha_de_pago=data.fecha_de_pago,
        unidad_de_negocio=data.unidad_de_negocio,
        glosa=data.glosa.strip() if data.glosa is not None else None,
        observaciones=data.observaciones.strip() if data.observaciones is not None else None,
        # pdf=data.pdf,  # Eliminado: ya no se usa campo pdf general
        # Nuevos campos para múltiples folios
        folio_uno=data.folio_uno,
        monto_por_folio_uno=data.monto_por_folio_uno,
        pdf_folio_uno=data.pdf_folio_uno,
        folio_dos=data.folio_dos,
        monto_por_folio_dos=data.monto_por_folio_dos,
        pdf_folio_dos=data.pdf_folio_dos,
        folio_tres=data.folio_tres,
        monto_por_folio_tres=data.monto_por_folio_tres,
        pdf_folio_tres=data.pdf_folio_tres,
        folio_cuatro=data.folio_cuatro,
        monto_por_folio_cuatro=data.monto_por_folio_cuatro,
        pdf_folio_cuatro=data.pdf_folio_cuatro,
        folio_cinco=data.folio_cinco,
        monto_por_folio_cinco=data.monto_por_folio_cinco,
        pdf_folio_cinco=data.pdf_folio_cinco,
        forma_pago_folio_uno=data.forma_pago_folio_uno,
        forma_pago_folio_dos=data.forma_pago_folio_dos,
        forma_pago_folio_tres=data.forma_pago_folio_tres,
        forma_pago_folio_cuatro=data.forma_pago_folio_cuatro,

        forma_pago_folio_cinco=data.forma_pago_folio_cinco,
        tipo_solicitud="Mis Solicitudes",  # Valor forzado por reglas de negocio
    ).returning(Tabla_Todas_Solicitudes)

    result = await session.execute(stmt)
    await session.commit()
    return result.scalar_one(), None

async def actualizar_todas_solicitudes_service(id: int, data: dict, session: AsyncSession):
    """
    Actualiza una solicitud existente por su ID aplicando restricciones de negocio y re-evaluando unicidad de folios.
    
    Flujo de ejecución y reglas específicas:
    1. Verifica la existencia de la solicitud. Si no se encuentra, aborta.
    2. Filtra campos de folios. A diferencia de otros campos que se ignoran si vienen vacíos (`None`), 
       los folios individuales y sus PDFs asociados sí se pueden actualizar a `None` para permitir su remoción.
    3. REGLA DE INMUTABILIDAD: Remueve `"solicitante"` y `"usuario_id"` de los datos de actualización para 
       evitar que se altere la autoría original de la solicitud.
    4. Valida unicidad global de folios únicamente para los folios nuevos o modificados (optimizando contra 
       los folios que ya pertenecían a la solicitud actual).
    5. Si cambia algún folio, regenera el campo consolidado `folio` (JSON o string directo) para retrocompatibilidad.
    
    Args:
        id (int): ID de la solicitud a actualizar.
        data (dict): Diccionario con los campos a modificar.
        session (AsyncSession): Sesión asíncrona de base de datos activa.
        
    Returns:
        Tuple[Optional[Tabla_Todas_Solicitudes], Optional[str]]:
            - Tabla_Todas_Solicitudes: El objeto actualizado (o None si falló la validación).
            - str: Mensaje de error si la validación de unicidad de folios falló, None si fue exitosa.
    """
    # Primero verificamos existencia
    solicitud_actual = await session.execute(select(Tabla_Todas_Solicitudes).where(Tabla_Todas_Solicitudes.id == id))
    solicitud_actual_obj = solicitud_actual.scalar_one_or_none()
    
    if not solicitud_actual_obj:
        return None, "Solicitud no encontrada"
    
    # Los campos de folios deben poder ser seteados en NULL para limpiarlos
    folio_fields = [
        'folio_uno', 'monto_por_folio_uno', 'pdf_folio_uno', 'forma_pago_folio_uno',
        'folio_dos', 'monto_por_folio_dos', 'pdf_folio_dos', 'forma_pago_folio_dos',
        'folio_tres', 'monto_por_folio_tres', 'pdf_folio_tres', 'forma_pago_folio_tres',
        'folio_cuatro', 'monto_por_folio_cuatro', 'pdf_folio_cuatro', 'forma_pago_folio_cuatro',
        'folio_cinco', 'monto_por_folio_cinco', 'pdf_folio_cinco', 'forma_pago_folio_cinco'
    ]
    
    update_data = {}
    for k, v in data.items():
        if v is not None or k in folio_fields:
            update_data[k] = v
    
    # REGLA DE NEGOCIO: El solicitante y usuario_id original son INMUTABLES
    update_data.pop("solicitante", None)
    update_data.pop("usuario_id", None)
    # REGLA DE NEGOCIO (auditoría H-19): el monto es INMUTABLE tras la creación, igual que en recepcionados
    # (la validación de abajo ya lo trata como "monto original inmutable"; el frontend reenvía el mismo valor).
    update_data.pop("monto", None)

    # Validar unicidad de folios si se están actualizando
    new_folios = []
    folios_changed = False
    for f_key in ['folio_uno', 'folio_dos', 'folio_tres', 'folio_cuatro', 'folio_cinco', 'folio']:
        if f_key in update_data:
            folios_changed = True
            if update_data[f_key]:
                new_folios.append(update_data[f_key])
            
    # Obtener folios actuales para no validarlos contra sí mismos (optimización)
    folios_actuales = set()
    for f_key in ['folio', 'folio_uno', 'folio_dos', 'folio_tres', 'folio_cuatro', 'folio_cinco']:
        val = getattr(solicitud_actual_obj, f_key, None)
        if val: folios_actuales.add(str(val).strip())
    
    for folio in new_folios:
        # Si el folio ya está en la solicitud actual, no necesitamos validarlo globalmente 
        # (check_folio_exists_global ya excluye el ID actual, pero esto es más eficiente y seguro)
        if str(folio).strip() in folios_actuales:
            continue

        existe, mensaje = await check_folio_exists_global(
            folio, 
            session, 
            exclude_solicitud_id=id,
            solicitante_context=update_data.get('solicitante', solicitud_actual_obj.solicitante),
            empresa_context=update_data.get('empresa', solicitud_actual_obj.empresa)
        )
        if existe:
            return None, mensaje

    # Si algún folio cambió, regenerar el campo 'folio' consolidado para compatibilidad
    if folios_changed:
        import orjson
        current_folios_list = []
        for i, num in enumerate(['uno', 'dos', 'tres', 'cuatro', 'cinco']):
            f_key = f'folio_{num}'
            # Prioridad: update_data > objeto_actual
            val = update_data.get(f_key, getattr(solicitud_actual_obj, f_key, None))
            if val: current_folios_list.append(str(val).strip())
        
        if current_folios_list:
            update_data['folio'] = orjson.dumps(current_folios_list).decode('utf-8') if len(current_folios_list) > 1 else current_folios_list[0]
        else:
            # AUDITORÍA H-20: la columna 'folio' es NOT NULL; antes se intentaba guardar NULL → IntegrityError → 500.
            return None, "La solicitud debe conservar al menos un folio."

    # REGLA DE NEGOCIO: Validar que la suma de folios no exceda el monto original
    temp_folios = {
        "monto_por_folio_uno": update_data.get("monto_por_folio_uno", solicitud_actual_obj.monto_por_folio_uno),
        "monto_por_folio_dos": update_data.get("monto_por_folio_dos", solicitud_actual_obj.monto_por_folio_dos),
        "monto_por_folio_tres": update_data.get("monto_por_folio_tres", solicitud_actual_obj.monto_por_folio_tres),
        "monto_por_folio_cuatro": update_data.get("monto_por_folio_cuatro", solicitud_actual_obj.monto_por_folio_cuatro),
        "monto_por_folio_cinco": update_data.get("monto_por_folio_cinco", solicitud_actual_obj.monto_por_folio_cinco),
    }
    
    suma_folios = sum(float(m) for m in temp_folios.values() if m is not None)
    monto_original = float(solicitud_actual_obj.monto)
    
    if suma_folios > monto_original:
        return None, f"La suma de los folios ({suma_folios}) excede el monto original inmutable ({monto_original})."

    estado_anterior = solicitud_actual_obj.estado if solicitud_actual_obj else None
    
    if "estado" in update_data:
        update_data["estado"] = update_data["estado"].upper()

    if not update_data:
        # Si no hay nada que actualizar, retornamos el objeto actual
        solicitud = await session.execute(select(Tabla_Todas_Solicitudes).where(Tabla_Todas_Solicitudes.id == id))
        return solicitud.scalar_one(), None

    # Actualización estilo Core con RETURNING
    stmt = (
        update(Tabla_Todas_Solicitudes)
        .where(Tabla_Todas_Solicitudes.id == id)
        .values(**update_data)
        .returning(Tabla_Todas_Solicitudes)
    )
    
    result = await session.execute(stmt)
    solicitud_actualizada = result.scalar_one()
    
    # REGISTRO AUTOMÁTICO EN HISTÓRICO (Transparent Hook)
    # Solo registrar si el estado cambió y es un estado registrable
    nuevo_estado = update_data.get("estado", estado_anterior)
    if nuevo_estado and nuevo_estado != estado_anterior:
        # Obtener datos completos de la solicitud actualizada para guardar en histórico
        solicitud_completa = await session.execute(
            select(Tabla_Todas_Solicitudes).where(Tabla_Todas_Solicitudes.id == id)
        )
        solicitud_para_historico = solicitud_completa.scalar_one()
        
        # Registrar cambio en histórico (dentro de la misma transacción)
        exito_hist, error_hist = await registrar_cambio_historico(
            id_solicitud=id,
            nuevo_estado=nuevo_estado,
            solicitud_data=solicitud_para_historico,
            session=session
        )
        
        if not exito_hist:
            logger.warning(f"Advertencia al registrar histórico para solicitud {id}: {error_hist}")
            # No retornamos error para no interrumpir el flujo, solo logueamos
    
    await session.commit()
    
    return solicitud_actualizada, None

