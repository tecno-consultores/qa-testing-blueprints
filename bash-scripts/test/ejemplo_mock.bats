#!/usr/bin/env bats

setup() {
    # Carga las librerías preinstaladas en la imagen sinfallas/base-bash-qa
    load '/opt/bats-libs/bats-support/load.bash'
    load '/opt/bats-libs/bats-assert/load.bash'
    load '/opt/bats-libs/bats-mock/load.bash'
}

@test "Falla si docker system prune devuelve error (Demostración de Mock)" {
    # 1. Creamos un mock del comando docker
    mock_docker="$(mock_create)"
    
    # 2. Le decimos que falle (código 1) cuando se le pase "system prune -af"
    mock_set_status "${mock_docker}" 1
    mock_set_output "${mock_docker}" "Error simulado de Docker"
    
    # 3. Interceptamos el binario de docker inyectando el mock al principio del PATH
    ln -s "${mock_docker}" "${BATS_TEST_TMPDIR}/docker"
    PATH="${BATS_TEST_TMPDIR}:$PATH"

    # 4. Ejecutamos un script imaginario que intenta limpiar docker
    # run bash ../limpiar.sh
    run docker system prune -af

    # 5. Validamos que el mock interceptó la llamada y nuestro script reaccionó bien
    assert_failure 1
    assert_output "Error simulado de Docker"
}
