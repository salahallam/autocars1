-- Supabase schema for autocars.
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.cars (
  id text primary key,
  name text not null,
  price integer not null check (price >= 0),
  image text not null,
  tag text not null default 'Standard',
  description text not null default '',
  status text not null default 'available' check (status in ('available','booked','maintenance')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id text primary key,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','completed','cancelled')),
  car_id text not null references public.cars(id),
  car_name text not null,
  price_per_day integer not null check (price_per_day >= 0),
  pickup_date date not null,
  return_date date not null,
  days integer not null check (days >= 1),
  delivery_fee integer not null default 0 check (delivery_fee >= 0),
  total integer not null check (total >= 0),
  full_name text not null,
  phone text not null,
  cin text not null,
  city text not null,
  delivery_location text not null,
  notes text not null default '',
  constraint valid_booking_dates check (return_date > pickup_date)
);

create index if not exists bookings_car_dates_idx on public.bookings(car_id, pickup_date, return_date);
create index if not exists bookings_status_idx on public.bookings(status);

insert into public.cars (id,name,price,image,tag,description,status,active) values
('dacia-sandero','Dacia Sandero',250,'assets/dacia-sandero.jpg','Économique','Citadine pratique et économique.','available',true),
('dacia-logan','Dacia Logan',250,'assets/dacia-logan.jpg','Berline','Berline confortable pour les trajets quotidiens.','available',true),
('mercedes-c63','Mercedes-AMG C63',1000,'assets/mercedes-c63.jpg','Premium','Berline sportive haut de gamme.','available',true),
('mercedes-coupe','Mercedes C Coupé',1000,'assets/mercedes-coupe.jpg','Premium','Coupé élégant au positionnement premium.','available',true),
('mercedes-g-class','Mercedes G-Class',1000,'assets/mercedes-g-class.jpg','SUV Premium','SUV premium pour une expérience plus exclusive.','available',true)
on conflict (id) do update set
  name=excluded.name,
  price=excluded.price,
  image=excluded.image,
  tag=excluded.tag,
  description=excluded.description;

-- Important: the service-role key must ONLY be used by the server.
-- Never place it in app.js or any public file.
