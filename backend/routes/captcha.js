const express = require('express');
const crypto = require('crypto');
const svgCaptcha = require('svg-captcha');
const { authMiddleware } = require('../middleware/auth');
const { captchaStore } = require('../utils/captchaStore');

const router = express.Router();

const brightColors = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa', '#f06595', '#20c997', '#ff8787', '#74c0fc', '#b197fc', '#fcc419', '#5c7cfa', '#e599f7', '#38d9a9']

function brightenSvg(svg) {
  // Only replace fill/stroke on <text> and <path> elements, leave <rect> background untouched
  return svg.replace(/(<(?:text|path)\s[^>]*?\b(?:fill|stroke)=")(#[0-9a-fA-F]{6})(")/g, (match, prefix, color, suffix) => {
    const newColor = brightColors[Math.floor(Math.random() * brightColors.length)]
    return prefix + newColor + suffix
  })
}

router.get('/captcha', (req, res) => {
  const captcha = svgCaptcha.create({
    size: 4,
    ignoreChars: '0o1iIlL',
    noise: 2,
    color: true,
    background: '#111823',
    width: 118,
    height: 48,
    fontSize: 42
  });

  // 使用加密安全随机 ID，避免验证码 ID 可预测
  const captchaId = crypto.randomUUID();
  captchaStore.set(captchaId, captcha.text.toLowerCase());

  // 简单上限保护，防止未消费的验证码无限堆积
  if (captchaStore.size > 10000) {
    const oldestKey = captchaStore.keys().next().value;
    if (oldestKey) captchaStore.delete(oldestKey);
  }

  const timer = setTimeout(() => {
    captchaStore.delete(captchaId);
  }, 5 * 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();

  res.json({
    captchaId,
    captcha: brightenSvg(captcha.data)
  });
});

router.post('/verify-captcha', authMiddleware, (req, res) => {
  const { captchaId, captchaText } = req.body;

  if (!captchaId || !captchaText) {
    return res.status(400).json({ error: '缺少验证码参数' });
  }

  const storedText = captchaStore.get(captchaId);

  if (!storedText) {
    return res.status(400).json({ error: '验证码已过期' });
  }

  if (storedText !== captchaText.toLowerCase()) {
    return res.status(400).json({ error: '验证码错误' });
  }

  captchaStore.delete(captchaId);

  res.json({ success: true });
});

router.post('/verify-captcha-noauth', (req, res) => {
  const { captchaId, captchaText } = req.body;

  if (!captchaId || !captchaText) {
    return res.status(400).json({ error: '缺少验证码参数' });
  }

  const storedText = captchaStore.get(captchaId);

  if (!storedText) {
    return res.status(400).json({ error: '验证码已过期' });
  }

  if (storedText !== captchaText.toLowerCase()) {
    return res.status(400).json({ error: '验证码错误' });
  }

  captchaStore.delete(captchaId);

  res.json({ success: true });
});

module.exports = router;