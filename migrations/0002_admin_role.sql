-- Fase 5: el administrador principal. Las rutas /api/admin/* y /api/smtp/* exigen role = 'admin'.
UPDATE users SET role = 'admin' WHERE email = 'alejandrotm91@gmail.com';
