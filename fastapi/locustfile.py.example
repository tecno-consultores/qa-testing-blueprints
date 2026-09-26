from locust import HttpUser, task, between

class FastApiStressUser(HttpUser):
    # Simula latencia natural entre acciones de usuario (1 a 3 segundos)
    wait_time = between(1, 3)

    @task(3)
    def check_health(self):
        """Simula múltiples lecturas concurrentes."""
        self.client.get("/health")

    @task(1)
    def invalid_login_attempt(self):
        """Genera carga enviando peticiones POST para validar el rendimiento de Pydantic."""
        self.client.post("/login", json={"username": "load_test", "password": "123"})
