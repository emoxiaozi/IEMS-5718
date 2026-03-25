PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;

CREATE TABLE categories (
  catid INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE products (
  pid         INTEGER PRIMARY KEY AUTOINCREMENT,
  catid       INTEGER NOT NULL,
  name        TEXT NOT NULL,
  price       REAL NOT NULL,
  description TEXT,
  image_path  TEXT,
  thumb_path  TEXT,
  FOREIGN KEY(catid) REFERENCES categories(catid)
);

INSERT INTO categories (name) VALUES ('Coffee'), ('Tea');

INSERT INTO products (catid, name, price, description, image_path, thumb_path) VALUES
(1, 'Arabica Coffee Beans', 12.90, 'Smooth and aromatic Arabica beans with a balanced flavor profile.', '/assets/coffee_1.jpeg', '/assets/coffee_1.jpeg'),
(1, 'Espresso Roast', 10.50, 'Bold espresso roast for rich crema and strong taste.', '/assets/coffee_2.jpeg', '/assets/coffee_2.jpeg'),
(2, 'Jasmine Green Tea', 8.50, 'Floral jasmine aroma with fresh green tea taste.', '/assets/tea1.jpeg', '/assets/tea1.jpeg'),
(2, 'Earl Grey Tea', 9.20, 'Classic black tea with bergamot aroma.', '/assets/tea2.jpeg', '/assets/tea2.jpeg');
CREATE TABLE IF NOT EXISTS orders (
  oid INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  address TEXT NOT NULL,
  total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  itemid INTEGER PRIMARY KEY AUTOINCREMENT,
  oid INTEGER NOT NULL,
  pid INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  qty INTEGER NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY(oid) REFERENCES orders(oid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
  userid INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
);

-- 初始用户数据 (密码均为 'password123' 的 bcrypt 哈希值)
INSERT INTO users (email, password, role) VALUES 
('admin@example.com', '$2b$10$7R5vL7rI9.S0A9G5E2P7.O1l2Z3m4n5o6p7q8r9s0t1u2v3w4x5y6', 'admin'),
('user@example.com', '$2b$10$7R5vL7rI9.S0A9G5E2P7.O1l2Z3m4n5o6p7q8r9s0t1u2v3w4x5y6', 'user');