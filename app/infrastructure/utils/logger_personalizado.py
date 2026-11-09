import logging
import logging.handlers
import sys
from pathlib import Path

def setup_logger(
    name: str = __name__,
    level: int = logging.INFO,
    log_dir: str = "logs",
    log_file: str = "app.log",
) -> logging.Logger:

    Path(log_dir).mkdir(parents=True, exist_ok=True)

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | ---> %(message)s",
        "%Y-%m-%d %H:%M:%S"
    )

    class ColorFormatter(logging.Formatter):
        COLORS = {
            logging.DEBUG: "\033[36m", #Azul
            logging.INFO: "\033[32m", #Verde
            logging.WARNING: "\033[33m", #Amarillo
            logging.ERROR: "\033[31m", #Rojo
            logging.CRITICAL: "\033[41m" #Rojo
        }
        RESET = "\033[0m"

        def format(self, record):
            color = self.COLORS.get(record.levelno, self.RESET)
            message = super().format(record)
            return f"{color}{message}{self.RESET}"

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(ColorFormatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        "%Y-%m-%d %H:%M:%S"
    ))

    file_handler = logging.handlers.RotatingFileHandler(
        filename=f"{log_dir}/{log_file}",
        maxBytes=5_000_000,
        backupCount=5,
        encoding="utf-8"
    )
    file_handler.setFormatter(formatter)

    logger = logging.getLogger(name)
    logger.setLevel(level)
    logger.handlers.clear()
    logger.addHandler(console_handler)
    logger.addHandler(file_handler)
    logger.propagate = False

    return logger
