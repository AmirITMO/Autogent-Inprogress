import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Прикрепление файлов к задачам: до 100 МБ на файл, до 1 ГБ для видео.
      bodySizeLimit: "1200mb",
    },
  },
};

export default nextConfig;
