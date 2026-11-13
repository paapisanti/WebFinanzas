-- Modo avanzado: se activa desde Ajustes y muestra la sección Patrimonio (inmuebles y deudas)
alter table settings add column if not exists advanced_mode boolean not null default false;
