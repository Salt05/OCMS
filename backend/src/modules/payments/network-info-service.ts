/**
 * Service phát hiện cấu hình mạng và địa chỉ IP LAN của máy chủ.
 * Tự động phân tích các card mạng (Wi-Fi, Ethernet, VPN...) tương tự lệnh `ipconfig`
 * để xác định địa chỉ IP phù hợp nhất cho điện thoại Android kết nối qua Wi-Fi/LAN.
 */
import os from 'node:os';
import fs from 'node:fs';
import { config } from '../../config/index.js';

export interface NetworkInterfaceDetail {
  name: string;
  ip: string;
  family: string;
  type: 'wifi' | 'ethernet' | 'virtual' | 'other';
  isRecommended: boolean;
  label: string;
}

export interface ServerNetworkInfoResult {
  success: boolean;
  primaryIp: string;
  port: number;
  isDocker: boolean;
  webhookUrl: string;
  healthUrl: string;
  interfaces: NetworkInterfaceDetail[];
}

export function getServerNetworkInfo(): ServerNetworkInfoResult {
  const nets = os.networkInterfaces();
  const rawList: Array<NetworkInterfaceDetail & { score: number }> = [];

  for (const name of Object.keys(nets)) {
    const netList = nets[name];
    if (!netList) continue;

    for (const net of netList) {
      // Chỉ lấy IPv4 và bỏ qua card loopback (127.0.0.1)
      if (net.family === 'IPv4' && !net.internal) {
        const ip = net.address;

        // Bỏ qua dải APIPA không định tuyến được (169.254.x.x)
        if (ip.startsWith('169.254.')) continue;

        const lowerName = name.toLowerCase();
        let type: 'wifi' | 'ethernet' | 'virtual' | 'other' = 'other';
        let score = 0;

        const isVirtual =
          lowerName.includes('wsl') ||
          lowerName.includes('virtual') ||
          lowerName.includes('vbox') ||
          lowerName.includes('vmware') ||
          lowerName.includes('hyper-v') ||
          lowerName.includes('vethernet') ||
          lowerName.includes('radmin') ||
          lowerName.includes('tailscale') ||
          lowerName.includes('zerotier') ||
          lowerName.includes('hamachi') ||
          lowerName.includes('loopback') ||
          lowerName.includes('tap') ||
          lowerName.includes('tun');

        if (isVirtual) {
          type = 'virtual';
          score -= 50;
        } else if (
          lowerName.includes('wi-fi') ||
          lowerName.includes('wifi') ||
          lowerName.includes('wireless') ||
          lowerName.includes('wlan')
        ) {
          type = 'wifi';
          score += 100;
        } else if (
          lowerName.includes('ethernet') ||
          lowerName.includes('lan') ||
          lowerName.includes('eth')
        ) {
          type = 'ethernet';
          score += 80;
        }

        // Ưu tiên dải mạng riêng chuẩn gia đình / văn phòng (192.168.x.x > 10.x.x.x > 172.x.x.x)
        if (ip.startsWith('192.168.')) {
          score += 50;
        } else if (ip.startsWith('10.')) {
          score += 40;
        } else if (ip.startsWith('172.') && !isVirtual) {
          score += 30;
        }

        rawList.push({
          name,
          ip,
          family: net.family,
          type,
          isRecommended: false,
          label: `${name} (${ip})`,
          score,
        });
      }
    }
  }

  // Sắp xếp các card mạng theo điểm ưu tiên giảm dần
  rawList.sort((a, b) => b.score - a.score);

  if (rawList.length > 0) {
    rawList[0].isRecommended = true;
    rawList[0].label += ' (Khuyên dùng)';
  }

  const cleanList: NetworkInterfaceDetail[] = rawList.map((item) => ({
    name: item.name,
    ip: item.ip,
    family: item.family,
    type: item.type,
    isRecommended: item.isRecommended,
    label: item.label,
  }));

  // Kiểm tra xem có đang chạy trong Docker container không
  const isDocker =
    fs.existsSync('/.dockerenv') ||
    cleanList.some((item) => item.ip.startsWith('172.17.') || item.ip.startsWith('172.18.') || item.ip.startsWith('172.19.'));

  // Lấy port bên ngoài từ config.appUrl nếu có (ví dụ http://localhost:3080 -> port 3080)
  let externalPort = 3080;
  try {
    if (config.appUrl) {
      const url = new URL(config.appUrl);
      if (url.port) externalPort = parseInt(url.port, 10);
    }
  } catch {}

  const hostIpFromEnv = process.env.HOST_IP || process.env.SERVER_IP;
  let primaryIp = hostIpFromEnv;

  if (!primaryIp) {
    const validLan = cleanList.find((item) => item.ip.startsWith('192.168.') || item.ip.startsWith('10.'));
    if (validLan) {
      primaryIp = validLan.ip;
    } else {
      primaryIp = cleanList[0]?.ip || '127.0.0.1';
    }
  }

  // Nếu đang chạy trong Docker container và có HOST_IP/SERVER_IP từ môi trường, thêm vào danh sách
  if (isDocker && hostIpFromEnv && !cleanList.some((item) => item.ip === hostIpFromEnv)) {
    cleanList.forEach((it) => { it.isRecommended = false; });
    cleanList.unshift({
      name: 'Host LAN IP',
      ip: hostIpFromEnv,
      family: 'IPv4',
      type: 'wifi',
      isRecommended: true,
      label: `Host LAN (${hostIpFromEnv}) (Khuyên dùng)`,
    });
  }

  const webhookUrl = `http://${primaryIp}:${externalPort}/api/v1/payments/sms-webhook`;
  const healthUrl = `http://${primaryIp}:${externalPort}/api/v1/payments/sms-webhook/health`;

  return {
    success: true,
    primaryIp,
    port: externalPort,
    isDocker,
    webhookUrl,
    healthUrl,
    interfaces: cleanList,
  };
}
