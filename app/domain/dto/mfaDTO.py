from pydantic import BaseModel, Field
from app.infrastructure.utils.validaciones import validate_password

class MFASetupResponse(BaseModel):
    qr_code_base64: str
    backup_codes: list[str]
    provisioning_uri: str

class MFAVerifyRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)

class MFAVerifyResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    message: str = "Autenticación 2FA exitosa"

class MFABackupVerifyRequest(BaseModel):
    backup_code: str

class MFAStatusResponse(BaseModel):
    mfa_enabled: bool
    mfa_verified_at: str | None = None
    must_change_password: bool = False

class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str
    confirm_password: str

    _new_password_valid = validate_password("new_password")

class PasswordForceChangeRequest(BaseModel):
    old_password: str
    new_password: str
    confirm_password: str

    _new_password_valid = validate_password("new_password")

