from fastapi import Request, HTTPException, status, Depends
from typing import Dict, Optional
from app.infrastructure.security.jwt_handler import verify_token
from app.infrastructure.utils.logger_personalizado import setup_logger

logger = setup_logger("AUTH_TOKEN_ROLES")


async def get_current_user(request: Request) -> Dict:
    """
    Dependency para obtener el usuario actual desde el token JWT.
    
    Busca el token en:
    1. Header 'Authorization' (Bearer token) - Mayor prioridad para evitar problemas en llamadas de API cruzadas.
    2. Cookie 'access_token' - Usado para renderizar vistas web nativas.
    
    Flujo de ejecución:
    - Extrae el token, lo valida usando jwt decoders y retorna el payload decodificado.
    - Si no se encuentra un token o es inválido, lanza un error HTTP 401.
    
    Args:
        request (Request): Objeto de petición HTTP.
        
    Raises:
        HTTPException: Si el token falta, expiró o su firma es inválida.
        
    Returns:
        Dict: Payload del token decodificado conteniendo las claims del usuario autenticado (id, email, rol, etc.).
    """
    token: Optional[str] = None
    
    # 1. Intentar obtener el token del header Authorization (Prioridad para evitar conflictos entre pestañas)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.replace("Bearer ", "")
    
    # 2. Si no está en header, buscar en las cookies
    if not token:
        token = request.cookies.get("access_token")
    
    # 3. Si no se encontró token en ningún lado
    if not token:
        logger.warning("Intento de acceso sin token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se proporcionó token de autenticación",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 4. Verificar y decodificar el token
    try:
        payload = verify_token(token)
        logger.info(f"Usuario autenticado: {payload.get('email')}")
        # [DEBUG] Detalles adicionales de la sesión del usuario
        # logger.debug(f"Rol del usuario: {payload.get('rol_nombre')}")
        # logger.debug(f"ID del usuario: {payload.get('sub')}")
        # logger.debug(f"Nombre del usuario: {payload.get('primer_nombre')}")
        # logger.debug(f"Apellido del usuario: {payload.get('primer_apellido')}")
        # logger.debug(f"RUT del usuario: {payload.get('rut')}")
        
        return payload
    except HTTPException as e:
        logger.error(f"Token inválido: {e.detail}")
        raise e


async def require_role(required_roles: list[str]):
    """
    Dependency factory que genera una dependencia para validar roles de usuario.
    
    Verifica que el rol cargado en la claim del JWT (`rol_nombre`) coincida con alguno de los roles 
    permitidos pasados por parámetro en `required_roles`.
    
    Riesgos y consideraciones:
    - Los nombres de roles son sensibles a mayúsculas y deben coincidir con la columna `nombre` de 
      la tabla `tabla_roles` de la base de datos (por ejemplo: "Administrador", "Supervisor", "Colaborador").
    - Si se modifican o añaden nuevos roles en BD, asegúrese de actualizar las definiciones de las 
      rutas asociadas correspondientes para evitar bloqueos accidentales a los usuarios.
      
    Args:
        required_roles (list[str]): Lista de roles autorizados para el endpoint.
        
    Returns:
        Callable: Función de dependencia asíncrona `role_checker` compatible con Depends().
    """
    async def role_checker(current_user: Dict = Depends(get_current_user)) -> Dict:
        user_role = current_user.get("rol_nombre")
        
        if user_role not in required_roles:
            logger.warning(
                f"Acceso denegado: usuario {current_user.get('email')} "
                f"con rol '{user_role}' intentó acceder a recurso que requiere {required_roles}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acceso denegado. Se requiere uno de estos roles: {', '.join(required_roles)}"
            )
        
        logger.info(f"Acceso autorizado para {current_user.get('email')} con rol {user_role}")
        return current_user
    
    return role_checker


# Shortcuts para roles comunes
async def require_admin(current_user: Dict = Depends(get_current_user)) -> Dict:
    """Dependency que requiere rol de Administrador"""
    checker = await require_role(["Administrador"])
    return await checker(current_user)


async def require_admin_or_supervisor(current_user: Dict = Depends(get_current_user)) -> Dict:
    """Dependency que requiere rol de Administrador o Supervisor"""
    checker = await require_role(["Administrador", "Supervisor"])
    return await checker(current_user)
