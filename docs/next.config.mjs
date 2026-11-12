import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: 'standalone',
  reactStrictMode: true,
  // 运行时 fs 读取的文件必须显式加入产物追踪，否则 serverless 部署会缺文件。
  outputFileTracingIncludes: {
    '/**': ['./index.md', './index.zh-CN.md', '../CHANGELOG.md'],
  },
  async rewrites() {
    return [
      { source: '/', destination: '/en' },
      { source: '/docs/:path*', destination: '/en/docs/:path*' },
    ];
  },
};

export default withMDX(config);
