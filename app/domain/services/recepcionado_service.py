from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, insert, update, delete
from app.infrastructure.security.hashing import hash_password
from datetime import date

from app.domain.models.tabla_recepcionados import Tabla_Recepcionados
from app.domain.models.tabla_todas_solicitudes import Tabla_Todas_Solicitudes
from app.domain.dto.recepcionadoDTO import RecepcionadoIn
from app.domain.services.historico_service import registrar_cambio_historico
from app.domain.services.todas_solicitudes import check_folio_exists_global
from app.infrastructure.utils.logger_personalizado import setup_logger

logger = setup_logger("RECEPCIONADO_SERVICE")


async def crear_recepcionado_service(data: RecepcionadoIn, session: AsyncSession):
    """
    Crea un nuevo registro recepcionado (`Tabla_Recepcionados`) aplicando reglas de negocio específicas de transición de estados y folios.
    
    Flujo de ejecución y reglas clave:
    1. El campo `folio` consolidado es estrictamente obligatorio.
    2. Valida unicidad global para cada sub-folio individual (`folio_uno` a `folio_cinco`) en todas las tablas del sistema.
    3. Auto-calcula el monto total sumando los montos de cada folio ingresado.
    4. REGLA DE NEGOCIO CRÍTICA: Si el registro cuenta con un PDF firmado (`pdf_firmado` no es nulo), 
       el estado final de la solicitud se fuerza automáticamente a "PAGADO" (flujo de automatización).
       
    Args:
        data (RecepcionadoIn): DTO con los datos del recepcionado validados por Pydantic.
        session (AsyncSession): Sesión asíncrona de base de datos activa.
        
    Returns:
        Tuple[Optional[Tabla_Recepcionados], Optional[str]]:
            - Tabla_Recepcionados: El objeto ORM insertado, o None si falla validación.
            - str: Mensaje de error de validación, o None si fue exitoso.
    """

    # Validar folio obligatorio
    if not data.folio or str(data.folio).strip() == "":
        return None, "El campo 'folio' es obligatorio para guardar en recepcionados."

    # Validar unicidad global
    exclude_sid = getattr(data, 'id_solicitud_origen', None)
    
    folios_a_validar = [data.folio_uno, data.folio_dos, data.folio_tres, data.folio_cuatro, data.folio_cinco]
    for folio in [f for f in folios_a_validar if f]:
        existe, mensaje = await check_folio_exists_global(
            folio, 
            session, 
            exclude_solicitud_id=exclude_sid,
            solicitante_context=data.solicitante,
            empresa_context=data.empresa
        )
        if existe:
            return None, mensaje
            
    # También validar el campo 'folio' consolidado si es diferente
    if data.folio not in folios_a_validar:
        existe, mensaje = await check_folio_exists_global(
            data.folio, 
            session, 
            exclude_solicitud_id=exclude_sid,
            solicitante_context=data.solicitante,
            empresa_context=data.empresa
        )
        if existe:
            return None, mensaje

    # Verificar solicitante existente (Utilizamos select básico de Core)
    result = await session.execute(
        select(Tabla_Recepcionados.id).where(
            and_(
                Tabla_Recepcionados.solicitante == data.solicitante,
                Tabla_Recepcionados.fecha_solicitud == data.fecha_solicitud,
                Tabla_Recepcionados.folio == data.folio,
                Tabla_Recepcionados.empresa == data.empresa,
                Tabla_Recepcionados.obra == data.obra,
                Tabla_Recepcionados.proceso == data.proceso,
                Tabla_Recepcionados.monto == data.monto,
                Tabla_Recepcionados.estado == data.estado,
                Tabla_Recepcionados.reviso == data.reviso,
                Tabla_Recepcionados.mes_de_proceso == data.mes_de_proceso, 
                Tabla_Recepcionados.anio == data.anio,
                Tabla_Recepcionados.cuenta_contable == data.cuenta_contable,
                Tabla_Recepcionados.auxiliar == data.auxiliar,
                Tabla_Recepcionados.fecha_de_pago == data.fecha_de_pago,
                Tabla_Recepcionados.unidad_de_negocio == data.unidad_de_negocio,
                Tabla_Recepcionados.glosa == data.glosa,
                Tabla_Recepcionados.observaciones == data.observaciones,
                
                Tabla_Recepcionados.folio_uno == data.folio_uno,
                Tabla_Recepcionados.monto_por_folio_uno == data.monto_por_folio_uno,
                Tabla_Recepcionados.pdf_folio_uno == data.pdf_folio_uno,
                Tabla_Recepcionados.forma_pago_folio_uno == data.forma_pago_folio_uno,
                Tabla_Recepcionados.folio_dos == data.folio_dos,
                Tabla_Recepcionados.monto_por_folio_dos == data.monto_por_folio_dos,
                Tabla_Recepcionados.pdf_folio_dos == data.pdf_folio_dos,
                Tabla_Recepcionados.forma_pago_folio_dos == data.forma_pago_folio_dos,
                Tabla_Recepcionados.folio_tres == data.folio_tres,
                Tabla_Recepcionados.monto_por_folio_tres == data.monto_por_folio_tres,
                Tabla_Recepcionados.pdf_folio_tres == data.pdf_folio_tres,
                Tabla_Recepcionados.forma_pago_folio_tres == data.forma_pago_folio_tres,
                Tabla_Recepcionados.folio_cuatro == data.folio_cuatro,
                Tabla_Recepcionados.monto_por_folio_cuatro == data.monto_por_folio_cuatro,
                Tabla_Recepcionados.pdf_folio_cuatro == data.pdf_folio_cuatro,
                Tabla_Recepcionados.forma_pago_folio_cuatro == data.forma_pago_folio_cuatro,
                Tabla_Recepcionados.folio_cinco == data.folio_cinco,
                Tabla_Recepcionados.monto_por_folio_cinco == data.monto_por_folio_cinco,
                Tabla_Recepcionados.pdf_folio_cinco == data.pdf_folio_cinco,
                Tabla_Recepcionados.forma_pago_folio_cinco == data.forma_pago_folio_cinco,
            )
        )
    )
    
    # Calcular monto automáticamente como suma de folios
    folios_montos = [
        data.monto_por_folio_uno,
        data.monto_por_folio_dos,
        data.monto_por_folio_tres,
        data.monto_por_folio_cuatro,
        data.monto_por_folio_cinco
    ]
    monto_calculado = sum(float(m) for m in folios_montos if m is not None)
    
    # REGLA DE NEGOCIO: Si tiene PDF firmado, el estado pasa a ser PAGADO automáticamente
    estado_final = data.estado.upper()
    if data.pdf_firmado:
        estado_final = "PAGADO"
        logger.info(f"Solicitud con PDF firmado: forzando estado PAGADO")

    # Inserción estilo Core con RETURNING
    stmt = insert(Tabla_Recepcionados).values(
        usuario_id=data.usuario_id,
        solicitante=data.solicitante,
        fecha_emision=data.fecha_emision,
        fecha_solicitud=data.fecha_solicitud,
        folio=data.folio,
        empresa=data.empresa,
        obra=data.obra,
        proceso=data.proceso,
        monto=monto_calculado, # Usar monto calculado, no data.monto
        estado=estado_final,
        reviso=data.reviso,
        mes_de_proceso=data.mes_de_proceso,
        anio=data.anio,
        cuenta_contable=data.cuenta_contable,
        auxiliar=data.auxiliar,
        fecha_de_pago=data.fecha_de_pago,
        unidad_de_negocio=data.unidad_de_negocio,
        glosa=data.glosa,
        observaciones=data.observaciones,
        # Campos de folios individuales
        folio_uno=data.folio_uno,
        monto_por_folio_uno=data.monto_por_folio_uno,
        pdf_folio_uno=data.pdf_folio_uno,
        forma_pago_folio_uno=data.forma_pago_folio_uno,
        folio_dos=data.folio_dos,
        monto_por_folio_dos=data.monto_por_folio_dos,
        pdf_folio_dos=data.pdf_folio_dos,
        forma_pago_folio_dos=data.forma_pago_folio_dos,
        folio_tres=data.folio_tres,
        monto_por_folio_tres=data.monto_por_folio_tres,
        pdf_folio_tres=data.pdf_folio_tres,
        forma_pago_folio_tres=data.forma_pago_folio_tres,
        folio_cuatro=data.folio_cuatro,
        monto_por_folio_cuatro=data.monto_por_folio_cuatro,
        pdf_folio_cuatro=data.pdf_folio_cuatro,
        forma_pago_folio_cuatro=data.forma_pago_folio_cuatro,
        folio_cinco=data.folio_cinco,
        monto_por_folio_cinco=data.monto_por_folio_cinco,
        pdf_folio_cinco=data.pdf_folio_cinco,
        forma_pago_folio_cinco=data.forma_pago_folio_cinco,
        tipo_solicitud=data.tipo_solicitud.value if hasattr(data.tipo_solicitud, 'value') else data.tipo_solicitud,
        pdf_firmado=data.pdf_firmado,
        pdf_registro_autorizacion=data.pdf_registro_autorizacion,
        fecha_aprobacion=data.fecha_aprobacion or date.today()
    ).returning(Tabla_Recepcionados)

    result = await session.execute(stmt)
    new_recep = result.scalar_one()
    
    # REGISTRO AUTOMÁTICO EN HISTÓRICO (Initial State)
    await registrar_cambio_historico(
        id_solicitud=new_recep.id,
        nuevo_estado=estado_final,
        solicitud_data=new_recep,
        session=session
    )

    await session.commit()
    
    return new_recep, None

async def actualizar_recepcionado_service(id: int, data: dict, session: AsyncSession):
    # Primero verificamos existencia de forma ligera
    result_exists = await session.execute(select(Tabla_Recepcionados).where(Tabla_Recepcionados.id == id))
    recepcionado_actual = result_exists.scalar_one_or_none()
    
    if not recepcionado_actual:
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
            
    # Validar unicidad global si se actualizan folios
    new_folios = []
    folios_changed = False
    for f_key in ['folio_uno', 'folio_dos', 'folio_tres', 'folio_cuatro', 'folio_cinco', 'folio']:
        if f_key in update_data:
            folios_changed = True
            if update_data[f_key]:
                new_folios.append(update_data[f_key])
            
    # Obtener folios actuales del recepcionado para no validarlos contra sí mismos
    folios_actuales = set()
    for f_key in ['folio', 'folio_uno', 'folio_dos', 'folio_tres', 'folio_cuatro', 'folio_cinco']:
        val = getattr(recepcionado_actual, f_key, None)
        if val: folios_actuales.add(str(val).strip())

    for folio in new_folios:
        # Optimización: si el folio ya lo tiene este registro, no validamos globalmente
        if str(folio).strip() in folios_actuales:
            continue

        existe, mensaje = await check_folio_exists_global(folio, session, exclude_recepcionado_id=id)
        if existe:
            return None, mensaje

    # Si algún folio cambió, regenerar el campo 'folio' consolidado
    if folios_changed:
        current_folios_list = []
        for num in ['uno', 'dos', 'tres', 'cuatro', 'cinco']:
            f_key = f'folio_{num}'
            val = update_data.get(f_key, getattr(recepcionado_actual, f_key, None))
            if val: current_folios_list.append(str(val).strip())
        
        if current_folios_list:
            # En recepcionados se guarda como string único o el primer folio? 
            # El DTO y models sugieren que 'folio' es el principal
            # Usaremos la misma lógica de orjson si hay múltiples
            import orjson
            update_data['folio'] = orjson.dumps(current_folios_list).decode('utf-8') if len(current_folios_list) > 1 else current_folios_list[0]
        else:
             # Si no hay folios detallados, el campo folio consolidado queda como estaba o nulo?
             # Si se pasó explícitamente en update_data se respeta, si no, se deja
             if 'folio' in update_data and not update_data['folio']:
                 update_data['folio'] = None
    
    # REGLA DE NEGOCIO: monto es INMUTABLE tras la creación
    update_data.pop("monto", None)

    # REGLA DE NEGOCIO: Validar que la suma de folios no exceda el monto original
    # Recolectar valores actuales y nuevos para el cálculo
    temp_folios = {
        "monto_por_folio_uno": update_data.get("monto_por_folio_uno", recepcionado_actual.monto_por_folio_uno),
        "monto_por_folio_dos": update_data.get("monto_por_folio_dos", recepcionado_actual.monto_por_folio_dos),
        "monto_por_folio_tres": update_data.get("monto_por_folio_tres", recepcionado_actual.monto_por_folio_tres),
        "monto_por_folio_cuatro": update_data.get("monto_por_folio_cuatro", recepcionado_actual.monto_por_folio_cuatro),
        "monto_por_folio_cinco": update_data.get("monto_por_folio_cinco", recepcionado_actual.monto_por_folio_cinco),
    }
    
    suma_folios = sum(float(m) for m in temp_folios.values() if m is not None)
    monto_original = float(recepcionado_actual.monto)
    
    if suma_folios > monto_original:
        return None, f"La suma de los folios ({suma_folios}) excede el monto original inmutable ({monto_original})."

    estado_anterior = recepcionado_actual.estado if recepcionado_actual else None
    
    if "estado" in update_data:
        update_data["estado"] = update_data["estado"].upper()
    
    # Lógica CRITICA para tipo_solicitud
    # Si se modifica en 'Recepcionados' (que es el único lugar donde se usa este endpoint para updates manuales)
    # cambiar a 'Recepcionado'.
    # Si ya es Recepcionado, se mantiene.
    # El usuario especificó: "Únicamente cuando la solicitud sea modificada en la sección 'Recepcionados' dentro de la tabla Recepcionados"
    
    current_tipo = recepcionado_actual.tipo_solicitud
    if current_tipo != "Recepcionado":
        update_data["tipo_solicitud"] = "Recepcionado"
    elif "tipo_solicitud" in update_data:
        # Si ya es Recepcionado, NO cambiamos nada (rollback prohibido por regla de negocio)
        # Si por alguna razón data trae "Mis Solicitudes", lo ignoramos/sobreescribimos si ya debería ser Recepcionado?
        # La regla dice: "Una vez que tipo_solicitud tenga el valor 'Recepcionado': No puede volver a modificarse"
        update_data.pop("tipo_solicitud", None) # Prevenir cambios manuales accidentales

    if not update_data:
        return recepcionado_actual, None

    # Actualización estilo Core con RETURNING
    stmt = (
        update(Tabla_Recepcionados)
        .where(Tabla_Recepcionados.id == id)
        .values(**update_data)
        .returning(Tabla_Recepcionados)
    )
    
    result = await session.execute(stmt)
    recepcionado_actualizado = result.scalar_one()
    
    # REGISTRO AUTOMÁTICO EN HISTÓRICO (Transparent Hook)
    # Solo registrar si el estado cambió y es un estado registrable
    nuevo_estado = update_data.get("estado", estado_anterior)
    if nuevo_estado and nuevo_estado != estado_anterior:
        # Obtener datos completos del recepcionado actualizado para guardar en histórico
        recepcionado_completo = await session.execute(
            select(Tabla_Recepcionados).where(Tabla_Recepcionados.id == id)
        )
        recepcionado_para_historico = recepcionado_completo.scalar_one()
        
        # Registrar cambio en histórico (dentro de la misma transacción)
        exito_hist, error_hist = await registrar_cambio_historico(
            id_solicitud=id,
            nuevo_estado=nuevo_estado,
            solicitud_data=recepcionado_para_historico,
            session=session
        )
        
        if not exito_hist:
            logger.warning(f"Advertencia al registrar histórico para recepcionado {id}: {error_hist}")
            # No retornamos error para no interrumpir el flujo, solo logueamos
    
    await session.commit()
    
    return recepcionado_actualizado, None


async def convertir_recepcionado_a_solicitud(recepcionado_id: int, data: dict, session: AsyncSession):
    """
    Promueve/convierte un registro recepcionado en una nueva solicitud formal (`Tabla_Todas_Solicitudes`).
    
    Esta función ejecuta una transición de estado compleja y crítica:
    1. Obtiene el recepcionado de origen y valida su existencia.
    2. REGLA DE NEGOCIO Y CONTROL FINANCIERO: Valida que la suma de los montos de los sub-folios individuales 
       (`suma_folios`) no sea mayor al monto original registrado (`monto_original`).
    3. Realiza la validación de unicidad global de folios para descartar colisiones en la base de datos.
    4. Crea el nuevo registro en `Tabla_Todas_Solicitudes` forzando:
       - `estado` a "PENDIENTE" (reiniciando el ciclo de vida del flujo).
       - `reviso` a "Jefe de Recursos Humanos" (reiniciando el primer nivel de aprobación).
       - `tipo_solicitud` a "Recepcionado".
    5. Inserta el registro del histórico correspondiente.
    6. Elimina físicamente el registro en `Tabla_Recepcionados` para evitar duplicidad de entidades.
    
    Consideraciones de atomicidad:
    - Esta operación combina escrituras, lecturas, inserciones de histórico y eliminaciones. Debe ejecutarse 
      siempre dentro de un bloque transaccional controlado por el llamador.
      
    Args:
        recepcionado_id (int): ID de la entidad recepcionada origen.
        data (dict): Diccionario con los campos de la petición a actualizar/sobreescribir.
        session (AsyncSession): Sesión asíncrona de base de datos activa.
        
    Returns:
        Tuple[Optional[int], Optional[str]]:
            - int: El ID de la nueva solicitud creada exitosamente.
            - str: Mensaje de error detallado si falló alguna validación o regla financiera, None si fue exitosa.
    """
    
    # Asegurar que el ID es un entero
    recepcionado_id = int(recepcionado_id)
    
    # Obtener el recepcionado actual
    result_exists = await session.execute(
        select(Tabla_Recepcionados).where(Tabla_Recepcionados.id == recepcionado_id)
    )
    recepcionado_actual = result_exists.scalar_one_or_none()
    
    if not recepcionado_actual:
        return None, f"Recepcionado con ID {recepcionado_id} no encontrado"
    
    # REGLA DE NEGOCIO: Validar que la suma de folios no exceda el monto original
    temp_folios = {
        "monto_por_folio_uno": data.get("monto_por_folio_uno", recepcionado_actual.monto_por_folio_uno),
        "monto_por_folio_dos": data.get("monto_por_folio_dos", recepcionado_actual.monto_por_folio_dos),
        "monto_por_folio_tres": data.get("monto_por_folio_tres", recepcionado_actual.monto_por_folio_tres),
        "monto_por_folio_cuatro": data.get("monto_por_folio_cuatro", recepcionado_actual.monto_por_folio_cuatro),
        "monto_por_folio_cinco": data.get("monto_por_folio_cinco", recepcionado_actual.monto_por_folio_cinco),
    }
    
    suma_folios = sum(float(m) for m in temp_folios.values() if m is not None)
    monto_original = float(recepcionado_actual.monto)
    
    if suma_folios > monto_original:
        return None, f"La suma de los folios ({suma_folios}) excede el monto original inmutable ({monto_original})."

    # Validar unicidad global antes de convertir
    folios_a_validar = []
    for num in ['uno', 'dos', 'tres', 'cuatro', 'cinco']:
        f_val = data.get(f'folio_{num}', getattr(recepcionado_actual, f'folio_{num}', None))
        if f_val: folios_a_validar.append(f_val)
    
    # También validar folio consolidado
    consolidated_folio = data.get('folio', recepcionado_actual.folio)
    if consolidated_folio and consolidated_folio not in folios_a_validar:
        folios_a_validar.append(consolidated_folio)
        
    solicitante_val = data.get('solicitante', recepcionado_actual.solicitante)
    empresa_val = data.get('empresa', recepcionado_actual.empresa)

    # Obtener folios actuales para optimizar validación
    folios_actuales = set()
    for num in ['uno', 'dos', 'tres', 'cuatro', 'cinco']:
        val = getattr(recepcionado_actual, f'folio_{num}', None)
        if val: folios_actuales.add(str(val).strip())

    for folio in folios_a_validar:
        # Optimización: si el folio ya existe en el recepcionado que estamos convirtiendo, 
        # no necesitamos validarlo globalmente (se moverá de tabla)
        if str(folio).strip() in folios_actuales:
            continue

        existe, mensaje = await check_folio_exists_global(
            folio, 
            session, 
            exclude_recepcionado_id=recepcionado_id,
            solicitante_context=solicitante_val,
            empresa_context=empresa_val
        )
        if existe:
            return None, mensaje

    try:
        # Regenerar folio consolidado para la nueva solicitud
        import orjson
        all_folios = []
        for num in ['uno', 'dos', 'tres', 'cuatro', 'cinco']:
            f_val = data.get(f'folio_{num}', getattr(recepcionado_actual, f'folio_{num}', None))
            if f_val: all_folios.append(str(f_val).strip())
        
        folio_db = orjson.dumps(all_folios).decode('utf-8') if len(all_folios) > 1 else (all_folios[0] if all_folios else data.get('folio', recepcionado_actual.folio))

        user_id_final = recepcionado_actual.usuario_id
        solicitante_final = recepcionado_actual.solicitante
        
        logger.info(f"Convirtiendo recepcionado {recepcionado_id}: original_uid={user_id_final}, original_solicitante={solicitante_final}")

        # Crear nueva solicitud con los datos modificados
        nueva_solicitud_data = {
            'usuario_id': user_id_final,
            'solicitante': solicitante_final,
            'fecha_emision': data.get('fecha_emision', recepcionado_actual.fecha_emision),
            'fecha_solicitud': data.get('fecha_solicitud', recepcionado_actual.fecha_solicitud),
            'folio': folio_db,
            'empresa': data.get('empresa', recepcionado_actual.empresa),
            'obra': data.get('obra', recepcionado_actual.obra),
            'proceso': data.get('proceso', recepcionado_actual.proceso),
            'monto': monto_original, # Inmutable
            'estado': 'PENDIENTE',  # Reinicia el flujo (AUDITORÍA H-24: forzado, como indica la regla documentada)
            'reviso': 'Jefe de Recursos Humanos',  # Vuelve al inicio del workflow
            'mes_de_proceso': data.get('mes_de_proceso', recepcionado_actual.mes_de_proceso),
            'anio': data.get('anio', recepcionado_actual.anio),
            'cuenta_contable': data.get('cuenta_contable', recepcionado_actual.cuenta_contable),
            'auxiliar': data.get('auxiliar', recepcionado_actual.auxiliar),
            'fecha_de_pago': data.get('fecha_de_pago', recepcionado_actual.fecha_de_pago),
            'unidad_de_negocio': data.get('unidad_de_negocio', recepcionado_actual.unidad_de_negocio),
            'glosa': data.get('glosa', recepcionado_actual.glosa),
            'observaciones': data.get('observaciones', recepcionado_actual.observaciones),
            'observaciones_devolucion': None,
            # Folios
            'folio_uno': data.get('folio_uno', recepcionado_actual.folio_uno),
            'monto_por_folio_uno': data.get('monto_por_folio_uno', recepcionado_actual.monto_por_folio_uno),
            'pdf_folio_uno': data.get('pdf_folio_uno', recepcionado_actual.pdf_folio_uno),
            'forma_pago_folio_uno': data.get('forma_pago_folio_uno', recepcionado_actual.forma_pago_folio_uno),
            'folio_dos': data.get('folio_dos', recepcionado_actual.folio_dos),
            'monto_por_folio_dos': data.get('monto_por_folio_dos', recepcionado_actual.monto_por_folio_dos),
            'pdf_folio_dos': data.get('pdf_folio_dos', recepcionado_actual.pdf_folio_dos),
            'forma_pago_folio_dos': data.get('forma_pago_folio_dos', recepcionado_actual.forma_pago_folio_dos),
            'folio_tres': data.get('folio_tres', recepcionado_actual.folio_tres),
            'monto_por_folio_tres': data.get('monto_por_folio_tres', recepcionado_actual.monto_por_folio_tres),
            'pdf_folio_tres': data.get('pdf_folio_tres', recepcionado_actual.pdf_folio_tres),
            'forma_pago_folio_tres': data.get('forma_pago_folio_tres', recepcionado_actual.forma_pago_folio_tres),
            'folio_cuatro': data.get('folio_cuatro', recepcionado_actual.folio_cuatro),
            'monto_por_folio_cuatro': data.get('monto_por_folio_cuatro', recepcionado_actual.monto_por_folio_cuatro),
            'pdf_folio_cuatro': data.get('pdf_folio_cuatro', recepcionado_actual.pdf_folio_cuatro),
            'forma_pago_folio_cuatro': data.get('forma_pago_folio_cuatro', recepcionado_actual.forma_pago_folio_cuatro),
            'folio_cinco': data.get('folio_cinco', recepcionado_actual.folio_cinco),
            'monto_por_folio_cinco': data.get('monto_por_folio_cinco', recepcionado_actual.monto_por_folio_cinco),
            'pdf_folio_cinco': data.get('pdf_folio_cinco', recepcionado_actual.pdf_folio_cinco),
            'forma_pago_folio_cinco': data.get('forma_pago_folio_cinco', recepcionado_actual.forma_pago_folio_cinco),
            'tipo_solicitud': 'Recepcionado',  # INMUTABLE: Se marca como Recepcionado
            'pdf_firmado': getattr(recepcionado_actual, 'pdf_firmado', None),
            'pdf_registro_autorizacion': getattr(recepcionado_actual, 'pdf_registro_autorizacion', None),
        }
        
        # Insertar nueva solicitud con RETURNING para obtener el ID
        stmt_insert = insert(Tabla_Todas_Solicitudes).values(**nueva_solicitud_data).returning(Tabla_Todas_Solicitudes)
        result_insert = await session.execute(stmt_insert)
        nueva_solicitud = result_insert.scalar_one()
        nueva_solicitud_id = nueva_solicitud.id
        
        # Eliminar el recepcionado original
        stmt_delete = delete(Tabla_Recepcionados).where(Tabla_Recepcionados.id == recepcionado_id)
        await session.execute(stmt_delete)
        
        # Confirmar transacción
        await session.commit()
        
        return nueva_solicitud_id, None
        
    except Exception as e:
        await session.rollback()
        logger.error(f"Error al convertir recepcionado {recepcionado_id}: {e}")
        # AUDITORÍA H-12: no exponer el error del driver (SQL) al cliente.
        return None, "Error al convertir recepcionado: los datos enviados no son válidos para la nueva solicitud."
