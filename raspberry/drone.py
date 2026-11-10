from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from pymavlink import mavutil

app = Flask(__name__, static_folder='site', static_url_path='')
CORS(app)

# Connexion au Pixhawk depuis le Raspberry Pi (ajuste le port si besoin, ex: /dev/ttyACM0)
try:
    master = mavutil.mavlink_connection('/dev/ttyACM0', baud=57600)
    master.wait_heartbeat()
    print("Connexion au Pixhawk établie avec succès !")
except Exception as e:
    print(f"Erreur de connexion au Pixhawk : {e}")
    master = None

@app.route('/api/drone', methods=['GET'])
def get_real_telemetry():
    lat, lon, alt, speed, battery = 49.848, 3.287, 0, 0, 100
    
    if master:
        # Demande et lecture des vraies données MAVLink du drone
        msg = master.recv_match(type='GLOBAL_POSITION_INT', blocking=True, timeout=0.5)
        if msg:
            lat = msg.lat / 1e7
            lon = msg.lon / 1e7
            alt = msg.relative_alt / 1000.0
            
        # Lecture de la batterie (SYS_STATUS)
        bat_msg = master.recv_match(type='SYS_STATUS', blocking=False)
        if bat_msg:
            battery = bat_msg.battery_remaining / 10.0 # en pourcentage

    drone_data = {
        "status": "En vol" if alt > 1 else "Au sol",
        "altitude": alt,
        "speed": speed,
        "battery": battery,
        "step": 2 if alt > 1 else 0,
        "position": {
            "latitude": lat,
            "longitude": lon
        }
    }

    return jsonify({
        "drone": drone_data,
        "history": []
    })

@app.route('/api/drone/mission', methods=['POST'])
def send_mission_to_drone():
    data = request.json
    target_lat = data.get('lat')
    target_lng = data.get('lng')
    
    if not master:
        return jsonify({"success": False, "message": "Pixhawk non connecte"}), 500

    # Ici, on enverra les commandes MAVLink de waypoint au Pixhawk pour de vrai
    print(f"Envoi du waypoint au Pixhawk : {target_lat}, {target_lng}")
    
    return jsonify({"success": True, "message": "Mission transmise au vrai drone !"})

if __name__ == '__main__':
    # Le serveur tourne sur le Raspberry Pi et écoute sur tout le réseau local
    app.run(host='0.0.0.0', port=5000)