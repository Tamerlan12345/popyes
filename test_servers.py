import urllib.request
import time

SERVERS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
]

QUERY = """
[out:json][timeout:25];
node(43.25, 76.90, 43.26, 76.91)["amenity"="cafe"];
out count;
"""

def check_server(url):
    print(f"Checking {url}...")
    try:
        data = QUERY.encode('utf-8')
        req = urllib.request.Request(url, data=data, method='POST', headers={'User-Agent': 'TestScript/1.0'})
        start = time.time()
        with urllib.request.urlopen(req, timeout=30) as f:
            resp = f.read().decode('utf-8')
            duration = time.time() - start
            print(f"✅ {url} responded in {duration:.2f}s")
            # print(resp[:100])
            return True
    except Exception as e:
        print(f"❌ {url} failed: {e}")
        return False

def main():
    results = {}
    for server in SERVERS:
        results[server] = check_server(server)

    print("-" * 20)
    print("Summary:")
    for server, status in results.items():
        print(f"{server}: {'UP' if status else 'DOWN'}")

if __name__ == "__main__":
    main()
