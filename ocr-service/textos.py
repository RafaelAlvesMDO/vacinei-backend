"""Utilidades de texto compartilhadas pelo pipeline e pelas ferramentas."""

import re
import unicodedata


def sem_acentos(texto: str) -> str:
    nfkd = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def ascii_simples(texto: str) -> str:
    """Texto só com ASCII, para o cv2.putText (que não desenha acentos nem ª/º)."""
    texto = texto.replace("ª", "a").replace("º", "o").replace("·", "-")
    return sem_acentos(texto).encode("ascii", "ignore").decode()


def normalizar(texto: str) -> str:
    """Maiúsculas, sem acentos e só com letras, dígitos e espaços."""
    texto = sem_acentos(texto).upper()
    texto = re.sub(r"[^A-Z0-9]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()
