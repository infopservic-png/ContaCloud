-- Agrega salesogarcia@gmail.com como administrador de ContaCloud.
-- Después de correrlo, cierra sesión y vuelve a entrar; verás /admin con la sección «Licencias».
insert into admins (email) values ('salesogarcia@gmail.com')
on conflict (email) do nothing;

-- Comprobación: debe listar tu correo
select email from admins;
