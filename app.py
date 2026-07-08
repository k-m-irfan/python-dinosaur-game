import os

from flask import Flask, jsonify, render_template, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
SCORES_FILE = os.path.join(BASE_DIR, "scores.txt")

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/assets/<path:filename>")
def assets(filename):
    # Serve the original game art, audio and font files.
    return send_from_directory(ASSETS_DIR, filename)


@app.route("/api/highscore", methods=["GET"])
def get_highscore():
    value = 0
    if os.path.exists(SCORES_FILE):
        try:
            with open(SCORES_FILE, "r") as f:
                value = int(f.read().strip() or 0)
        except (ValueError, OSError):
            value = 0
    return jsonify({"highscore": value})


@app.route("/api/highscore", methods=["POST"])
def set_highscore():
    data = request.get_json(silent=True) or {}
    try:
        score = int(data.get("score", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid score"}), 400

    current = 0
    if os.path.exists(SCORES_FILE):
        try:
            with open(SCORES_FILE, "r") as f:
                current = int(f.read().strip() or 0)
        except (ValueError, OSError):
            current = 0

    if score > current:
        with open(SCORES_FILE, "w") as f:
            f.write(str(score))
        current = score

    return jsonify({"highscore": current})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)
