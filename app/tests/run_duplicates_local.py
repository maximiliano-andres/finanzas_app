import asyncio
import httpx

BASE_URL = "http://localhost:8000/api"

async def test_duplicate_all_fields():
    async with httpx.AsyncClient() as client:
        try:
            # 1. Get existing obras to find values
            response = await client.get(f"{BASE_URL}/procesos_auxiliares")
            if response.status_code != 200:
                print(f"Error fetching obras: {response.status_code}")
                return
            
            result = response.json()
            obras = result.get('data', [])
            
            if not obras:
                print("No existing obras to test with.")
                return
            
            existing = obras[0]
            print(f"Testing with existing - Numero: {existing['numero']}, Detalle: {existing['detalle']}, Auxiliar: {existing['auxiliar']}")

            # 2. Test Duplicate Numero (POST)
            data_num = {"numero": existing['numero'], "detalle": "Unique Detalle", "auxiliar": "UNIQUE1", "estado": "ACTIVO"}
            resp_num = await client.post(f"{BASE_URL}/procesos_auxiliares", json=data_num)
            print(f"POST Duplicate Numero: {resp_num.status_code} - {resp_num.text}")

            # 3. Test Duplicate Detalle (POST)
            data_det = {"numero": "UNIQUE2", "detalle": existing['detalle'], "auxiliar": "UNIQUE3", "estado": "ACTIVO"}
            resp_det = await client.post(f"{BASE_URL}/procesos_auxiliares", json=data_det)
            print(f"POST Duplicate Detalle: {resp_det.status_code} - {resp_det.text}")

            # 4. Test Duplicate Auxiliar (POST)
            data_aux = {"numero": "UNIQUE4", "detalle": "Unique Detalle 2", "auxiliar": existing['auxiliar'], "estado": "ACTIVO"}
            resp_aux = await client.post(f"{BASE_URL}/procesos_auxiliares", json=data_aux)
            print(f"POST Duplicate Auxiliar: {resp_aux.status_code} - {resp_aux.text}")

            # 5. Test Update Duplicates (PUT)
            if len(obras) > 1:
                target_id = obras[1]['id']
                # Try to update target_id to existing[field]
                for field, val in [("numero", existing['numero']), ("detalle", existing['detalle']), ("auxiliar", existing['auxiliar'])]:
                    update_data = {
                        "numero": val if field == "numero" else "UNIQUE_UPDATE_N",
                        "detalle": val if field == "detalle" else "UNIQUE_UPDATE_D",
                        "auxiliar": val if field == "auxiliar" else "UNIQUE_UPDATE_A",
                        "estado": "ACTIVO"
                    }
                    resp_upd = await client.put(f"{BASE_URL}/procesos_auxiliares/{target_id}", json=update_data)
                    print(f"PUT Duplicate {field}: {resp_upd.status_code} - {resp_upd.text}")
            else:
                print("Only one obra exists, skipping update tests.")
        except Exception as e:
            print(f"An error occurred: {e}")

if __name__ == "__main__":
    asyncio.run(test_duplicate_all_fields())
