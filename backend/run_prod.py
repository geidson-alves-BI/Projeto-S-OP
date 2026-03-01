import os

import uvicorn

from backend.app.main import app


def main() -> None:
    host = os.getenv("OPERION_BACKEND_HOST", "127.0.0.1")
    port = int(os.getenv("OPERION_BACKEND_PORT", "8000"))

    uvicorn.run(
        app,
        host=host,
        port=port,
        workers=1,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
