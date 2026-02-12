import urllib.request
import urllib.parse
import json
import time

def get_point_data(lat, lon):
    # Specialized query for EXACT location (0-15m)
    query = f"""
      [out:json][timeout:60];
      (
        node(around:15, {lat}, {lon})["natural"~"water|beach|wetland|wood|scrub|heath|grassland"];
        way(around:15, {lat}, {lon})["natural"~"water|beach|wetland|wood|scrub|heath|grassland"];
        relation(around:15, {lat}, {lon})["natural"~"water|beach|wetland|wood|scrub|heath|grassland"];

        node(around:15, {lat}, {lon})["landuse"~"cemetery|industrial|forest|meadow|military|railway|quarry|reservoir|basin"];
        way(around:15, {lat}, {lon})["landuse"~"cemetery|industrial|forest|meadow|military|railway|quarry|reservoir|basin"];
        relation(around:15, {lat}, {lon})["landuse"~"cemetery|industrial|forest|meadow|military|railway|quarry|reservoir|basin"];

        way(around:15, {lat}, {lon})["highway"~"motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link"];

        node(around:15, {lat}, {lon})["leisure"~"park|garden|playground|pitch|nature_reserve"];
        way(around:15, {lat}, {lon})["leisure"~"park|garden|playground|pitch|nature_reserve"];
        relation(around:15, {lat}, {lon})["leisure"~"park|garden|playground|pitch|nature_reserve"];
      );
      out tags;
    """

    url = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
    try:
        data = query.encode('utf-8')
        req = urllib.request.Request(url, data=data, method='POST', headers={'User-Agent': 'VerificationScript/1.0'})
        with urllib.request.urlopen(req) as f:
            resp = f.read().decode('utf-8')
            return json.loads(resp)
    except Exception as e:
        print(f"Error fetching point data: {e}")
        return None

def parse_point_data(data):
    features = []
    if not data or "elements" not in data:
        return features

    for el in data["elements"]:
        tags = el.get("tags", {})
        type_found = tags.get("natural") or tags.get("landuse") or tags.get("highway") or tags.get("leisure")
        name = tags.get("name") or type_

        if type_found:
            features.append(f"{name} ({type_found})")

    return features

def run_test():
    # 1. Lake Sairan
    lat, lon = 43.24403, 76.86484
    print(f"Testing Lake Sairan ({lat}, {lon})...")
    data = get_point_data(lat, lon)
    features = parse_point_data(data)
    print("Point Features:", features)
    if any("water" in f or "reservoir" in f for f in features):
         print("✅ SUCCESS: Water/Reservoir detected.")
    else:
         print("❌ FAILURE: Water NOT detected.")
    print("-" * 20)

    time.sleep(1)

    # 2. VOAD Highway
    lat, lon = 43.2384, 76.9658
    print(f"Testing VOAD Highway ({lat}, {lon})...")
    data = get_point_data(lat, lon)
    features = parse_point_data(data)
    print("Point Features:", features)
    if any("trunk" in f or "motorway" in f for f in features):
         print("✅ SUCCESS: Highway detected.")
    else:
         print("❌ WARNING: Highway NOT detected (Check coords).")
    print("-" * 20)

if __name__ == "__main__":
    run_test()
