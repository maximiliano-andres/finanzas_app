# cors.py
import os
from fastapi.middleware.cors import CORSMiddleware

class CustomCORSMiddleware(CORSMiddleware):
    def __init__(self, app):
        allowed_origins_env = os.getenv("CORS_ALLOWED_ORIGINS", "")
        if allowed_origins_env:
            allow_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
        else:
            allow_origins = [
                "http://localhost:8000",
                "http://127.0.0.1:8000",
                "https://ingresar_dominio.cl",
                "https://www.tudominio.cl",
            ]

        super().__init__(
            app,
            allow_origins=allow_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "DELETE"],
            allow_headers=[
                "Authorization",
                "Content-Type",
                "X-Requested-With",
            ],
            max_age=600,
        )
