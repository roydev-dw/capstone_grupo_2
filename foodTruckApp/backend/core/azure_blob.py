# core/azure_blob.py
import mimetypes, os, uuid
from urllib.parse import urlparse
from django.conf import settings
from azure.storage.blob import BlobServiceClient, ContentSettings

def _service_client():
    """Crea cliente autenticado con Azure AD (Managed Identity)."""
    return BlobServiceClient(
        account_url=settings.AZURE_BLOB_ACCOUNT_URL,
        credential=settings.AZURE_DEFAULT_CREDENTIAL
    )

def _container_client():
    """Obtiene el contenedor configurado."""
    svc = _service_client()
    return svc.get_container_client(settings.AZURE_BLOB_CONTAINER)

def safe_ext(filename: str) -> str:
    _, ext = os.path.splitext(filename or "")
    return ext.lower() if ext else ""

def make_blob_name(producto_id: int, filename: str) -> str:
    ext = safe_ext(filename) or ".bin"
    return f"{producto_id}/{uuid.uuid4().hex}{ext}"

def guess_content_type(filename: str) -> str:
    ctype, _ = mimetypes.guess_type(filename or "")
    return ctype or "application/octet-stream"

def upload_file(producto_id: int, fileobj, filename: str) -> str:
    """Sube el archivo al contenedor y devuelve la URL."""
    blob_name = make_blob_name(producto_id, filename)
    ctype = guess_content_type(filename)
    container = _container_client()
    blob = container.get_blob_client(blob_name)
    blob.upload_blob(fileobj, overwrite=True,
                     content_settings=ContentSettings(content_type=ctype))
    return f"{settings.AZURE_BLOB_ACCOUNT_URL}/{settings.AZURE_BLOB_CONTAINER}/{blob_name}"

def delete_by_url(url: str) -> bool:
    """Elimina un blob existente."""
    if not url:
        return True
    parsed = urlparse(url)
    parts = parsed.path.strip("/").split("/", 1)
    if len(parts) != 2:
        return False
    container_name, blob_path = parts
    if container_name != settings.AZURE_BLOB_CONTAINER:
        return False
    svc = _service_client()
    blob = svc.get_blob_client(container=container_name, blob=blob_path)
    try:
        blob.delete_blob()
        return True
    except Exception:
        return True