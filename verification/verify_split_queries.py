import urllib.request
import urllib.parse
import json
import time

# Use one of the servers
SERVER = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'

def execute_query(query, label):
    print(f"Testing {label} Query...")
    try:
        data = query.encode('utf-8')
        req = urllib.request.Request(SERVER, data=data, method='POST', headers={'User-Agent': 'VerificationScript/1.0'})
        start = time.time()
        with urllib.request.urlopen(req, timeout=60) as f:
            resp = f.read().decode('utf-8')
            duration = time.time() - start
            try:
                json_data = json.loads(resp)
                elements = json_data.get('elements', [])
                print(f"✅ {label}: Success ({len(elements)} elements) in {duration:.2f}s")
                return True
            except json.JSONDecodeError:
                print(f"❌ {label}: Invalid JSON received.")
                return False
    except Exception as e:
        print(f"❌ {label}: Request failed: {e}")
        return False

def verify_commercial(lat, lon):
    query = f"""
      [out:json][timeout:60];
      (
        node(around:500, {lat}, {lon})["amenity"~"fast_food|cafe|restaurant|pub|bar|food_court|biergarten"];
        way(around:500, {lat}, {lon})["amenity"~"fast_food|cafe|restaurant|pub|bar|food_court|biergarten"];
        node(around:500, {lat}, {lon})["shop"~"mall|supermarket|marketplace"];
        way(around:500, {lat}, {lon})["shop"~"mall|supermarket|marketplace"];
        node(around:500, {lat}, {lon})["office"];
        way(around:500, {lat}, {lon})["office"];
        node(around:100, {lat}, {lon})["amenity"~"atm|bank"];
      );
      out center;
    """
    return execute_query(query, "Commercial")

def verify_infrastructure(lat, lon):
    query = f"""
      [out:json][timeout:60];
      (
        node(around:500, {lat}, {lon})["amenity"~"school|university|college|kindergarten"];
        way(around:500, {lat}, {lon})["amenity"~"school|university|college|kindergarten"];
        node(around:100, {lat}, {lon})["highway"="crossing"];
        way(around:100, {lat}, {lon})["highway"="footway"];
        node(around:500, {lat}, {lon})["highway"="bus_stop"];
        node(around:500, {lat}, {lon})["railway"="subway_entrance"];
        node(around:500, {lat}, {lon})["landuse"~"cemetery|industrial|garages|landfill|brownfield"];
        way(around:500, {lat}, {lon})["landuse"~"cemetery|industrial|garages|landfill|brownfield"];
        node(around:500, {lat}, {lon})["amenity"~"prison|grave_yard|waste_disposal|mortuary"];
        way(around:500, {lat}, {lon})["amenity"~"prison|grave_yard|waste_disposal|mortuary"];
        node(around:100, {lat}, {lon})["natural"~"water|beach|wetland"];
        way(around:100, {lat}, {lon})["natural"~"water|beach|wetland"];
        node(around:100, {lat}, {lon})["landuse"~"forest"];
        way(around:100, {lat}, {lon})["landuse"~"forest"];
      );
      out center;
    """
    return execute_query(query, "Infrastructure")

def verify_housing(lat, lon):
    # Radius 300m
    query = f"""
      [out:json][timeout:60];
      (
        way(around:300, {lat}, {lon})["building"~"apartments|residential"];
      );
      out center;
    """
    return execute_query(query, "Housing")

def main():
    # Almaty Center
    lat, lon = 43.25654, 76.92848
    print(f"Verifying Split Queries for Almaty Center ({lat}, {lon})...")

    results = []
    results.append(verify_commercial(lat, lon))
    time.sleep(1)
    results.append(verify_infrastructure(lat, lon))
    time.sleep(1)
    results.append(verify_housing(lat, lon))

    if all(results):
        print("\n✅ All Split Queries Verified Successfully!")
    else:
        print("\n❌ Some queries failed.")

if __name__ == "__main__":
    main()
