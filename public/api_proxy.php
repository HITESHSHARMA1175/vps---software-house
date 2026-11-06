<?php
// PHP Reverse Proxy Bridge for Apache/LiteSpeed to Node.js Express Backend (Port 5000)
@ini_set('memory_limit', '2048M');
@ini_set('max_execution_time', '1800');
@ini_set('post_max_size', '256M');
@ini_set('upload_max_filesize', '256M');
@set_time_limit(1800);

$request_uri = $_SERVER['REQUEST_URI'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Target Node.js Express Server Port 5000
$target_url = 'http://127.0.0.1:5000' . $request_uri;

$headers = array();
$blocked_headers = array('host', 'content-length', 'connection', 'keep-alive', 'x-internal-secret', 'x-server-secret');

if (function_exists('getallheaders')) {
    foreach (getallheaders() as $name => $value) {
        $lower = strtolower($name);
        if (!in_array($lower, $blocked_headers)) {
            $headers[] = "$name: $value";
        }
    }
} else {
    foreach ($_SERVER as $name => $value) {
        if (substr($name, 0, 5) == 'HTTP_') {
            $header_name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
            $lower = strtolower($header_name);
            if (!in_array($lower, $blocked_headers)) {
                $headers[] = "$header_name: $value";
            }
        }
    }
}

// Forward Client Real IP and Host
$client_ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
$headers[] = "X-Forwarded-For: " . $client_ip;
$headers[] = "X-Real-IP: " . $client_ip;
$headers[] = "X-Forwarded-Host: " . ($_SERVER['HTTP_HOST'] ?? 'vps.innovationwebworks.in');
$headers[] = "X-Forwarded-Proto: " . (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'https');

$contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
if (!empty($contentType)) {
    $hasCt = false;
    foreach ($headers as $h) {
        if (stripos($h, 'Content-Type:') === 0) { $hasCt = true; break; }
    }
    if (!$hasCt) {
        $headers[] = "Content-Type: " . $contentType;
    }
}

// Eliminate 100-continue handshake delay on chunked uploads
$headers[] = "Expect:";

// Ultra-fast streaming proxy for large file downloads (bypasses 250MB PHP RAM buffering)
if ($method === 'GET' && (stripos($request_uri, '/download-chunk') !== false || stripos($request_uri, 'InnovationVpsAgent.exe') !== false || stripos($request_uri, 'dist.tar.gz') !== false)) {
    while (@ob_get_level()) { @ob_end_clean(); }
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $target_url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'GET');
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_TIMEOUT, 1800);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($ch, $header_line) {
        $trimmed = trim($header_line);
        if (preg_match('/^HTTP\/[\d\.]+\s+(\d+)/i', $trimmed, $m)) {
            http_response_code(intval($m[1]));
        } else if (!empty($trimmed) && stripos($trimmed, 'Transfer-Encoding:') === false) {
            header($trimmed, false);
        }
        return strlen($header_line);
    });
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $chunk) {
        echo $chunk;
        @flush();
        return strlen($chunk);
    });
    curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($http_code) http_response_code($http_code);
    curl_close($ch);
    exit;
}

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $target_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_TIMEOUT, 600);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 60);

if (isset($_SERVER['HTTP_COOKIE']) && !empty($_SERVER['HTTP_COOKIE'])) {
    curl_setopt($ch, CURLOPT_COOKIE, $_SERVER['HTTP_COOKIE']);
}

if ($method === 'POST' || $method === 'PUT' || $method === 'PATCH' || $method === 'DELETE') {
    $input_data = file_get_contents('php://input');
    if ($input_data !== false && strlen($input_data) > 0) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $input_data);
    }
}

$response = curl_exec($ch);

if (curl_errno($ch)) {
    // Retry once with 500ms delay in case of transient local port 5000 reset
    usleep(500000);
    $response = curl_exec($ch);
}

if (curl_errno($ch)) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(array("success" => false, "error" => array("code" => "BAD_GATEWAY", "message" => "Backend Proxy Error: " . curl_error($ch))));
    curl_close($ch);
    exit;
}

$header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$response_headers = substr($response, 0, $header_size);
$response_body = substr($response, $header_size);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);

curl_close($ch);

http_response_code($http_code);

// Forward Response Headers (including Set-Cookie)
$header_lines = explode("\r\n", $response_headers);
foreach ($header_lines as $header) {
    if (!empty($header) && strpos($header, 'HTTP/') !== 0 && strpos($header, 'Transfer-Encoding:') === false) {
        header($header, false);
    }
}

echo $response_body;
?>
