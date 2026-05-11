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
(1, 'Colombian Medium Roast', 11.80, 'Nutty and balanced medium roast with cocoa notes.', '/assets/coffee_1.jpeg', '/assets/coffee_1.jpeg'),
(1, 'Ethiopian Light Roast', 13.20, 'Bright acidity with floral aroma and citrus finish.', '/assets/coffee_2.jpeg', '/assets/coffee_2.jpeg'),
(1, 'Guatemala Dark Roast', 12.40, 'Full-bodied dark roast with smoky sweetness.', '/assets/coffee_1.jpeg', '/assets/coffee_1.jpeg'),
(1, 'House Blend', 9.90, 'Everyday blend for drip coffee and pour-over.', '/assets/coffee_2.jpeg', '/assets/coffee_2.jpeg'),
(1, 'Decaf Blend', 10.20, 'Smooth decaf with a clean finish.', '/assets/coffee_1.jpeg', '/assets/coffee_1.jpeg'),
(1, 'Mocha Flavored Coffee', 11.10, 'Chocolate aroma with a sweet aftertaste.', '/assets/coffee_2.jpeg', '/assets/coffee_2.jpeg'),
(1, 'Vanilla Flavored Coffee', 11.10, 'Vanilla aroma with a smooth body.', '/assets/coffee_1.jpeg', '/assets/coffee_1.jpeg'),
(1, 'Caramel Flavored Coffee', 11.10, 'Caramel sweetness with a rich body.', '/assets/coffee_2.jpeg', '/assets/coffee_2.jpeg'),
(1, 'Single Origin Kenya AA', 14.50, 'Berry notes and wine-like acidity.', '/assets/coffee_1.jpeg', '/assets/coffee_1.jpeg'),
(1, 'Single Origin Sumatra', 13.80, 'Earthy and bold with low acidity.', '/assets/coffee_2.jpeg', '/assets/coffee_2.jpeg'),
(1, 'Cold Brew Pack', 15.00, 'Coarse ground coffee optimized for cold brew.', '/assets/coffee_1.jpeg', '/assets/coffee_1.jpeg'),
(1, 'Espresso Capsules', 16.90, 'Convenient capsules for quick espresso.', '/assets/coffee_2.jpeg', '/assets/coffee_2.jpeg'),
(1, 'Organic Coffee Beans', 13.60, 'Certified organic beans with clean taste.', '/assets/coffee_1.jpeg', '/assets/coffee_1.jpeg'),
(1, 'Café Latte Mix', 9.50, 'Instant latte mix for quick preparation.', '/assets/coffee_2.jpeg', '/assets/coffee_2.jpeg'),
(1, 'Americano Blend', 10.80, 'Roast profile ideal for americano.', '/assets/coffee_1.jpeg', '/assets/coffee_1.jpeg'),
(1, 'Breakfast Blend', 10.30, 'Light and crisp blend for mornings.', '/assets/coffee_2.jpeg', '/assets/coffee_2.jpeg'),
(2, 'Jasmine Green Tea', 8.50, 'Floral jasmine aroma with fresh green tea taste.', '/assets/tea1.jpeg', '/assets/tea1.jpeg'),
(2, 'Earl Grey Tea', 9.20, 'Classic black tea with bergamot aroma.', '/assets/tea2.jpeg', '/assets/tea2.jpeg'),
(2, 'Oolong Tea', 9.80, 'Fragrant oolong with smooth finish.', '/assets/tea1.jpeg', '/assets/tea1.jpeg'),
(2, 'Chamomile Tea', 7.90, 'Caffeine-free herbal tea for relaxation.', '/assets/tea2.jpeg', '/assets/tea2.jpeg'),
(2, 'Matcha Powder', 12.90, 'Stone-ground matcha for latte and baking.', '/assets/tea1.jpeg', '/assets/tea1.jpeg'),
(2, 'Assam Black Tea', 8.80, 'Bold black tea with malty flavor.', '/assets/tea2.jpeg', '/assets/tea2.jpeg'),
(2, 'Darjeeling Tea', 10.20, 'Light-bodied tea with floral notes.', '/assets/tea1.jpeg', '/assets/tea1.jpeg'),
(2, 'English Breakfast Tea', 9.10, 'Classic breakfast blend with rich taste.', '/assets/tea2.jpeg', '/assets/tea2.jpeg'),
(2, 'Peppermint Tea', 7.50, 'Refreshing peppermint herbal tea.', '/assets/tea1.jpeg', '/assets/tea1.jpeg'),
(2, 'Roasted Barley Tea', 7.80, 'Nutty aroma with roasted barley taste.', '/assets/tea2.jpeg', '/assets/tea2.jpeg'),
(2, 'Lemon Ginger Tea', 8.10, 'Zesty citrus with gentle ginger warmth.', '/assets/tea1.jpeg', '/assets/tea1.jpeg'),
(2, 'Honey Chrysanthemum Tea', 8.60, 'Floral chrysanthemum with honey notes.', '/assets/tea2.jpeg', '/assets/tea2.jpeg'),
(2, 'Pu-erh Tea', 11.50, 'Aged tea with earthy depth.', '/assets/tea1.jpeg', '/assets/tea1.jpeg'),
(2, 'Hojicha Tea', 9.40, 'Roasted green tea with caramel aroma.', '/assets/tea2.jpeg', '/assets/tea2.jpeg'),
(2, 'Genmaicha Tea', 9.00, 'Green tea with toasted rice.', '/assets/tea1.jpeg', '/assets/tea1.jpeg'),
(2, 'White Tea', 10.80, 'Delicate tea with sweet finish.', '/assets/tea2.jpeg', '/assets/tea2.jpeg'),
(2, 'Fruit Tea Blend', 8.90, 'Fruity infusion with bright aroma.', '/assets/tea1.jpeg', '/assets/tea1.jpeg');
CREATE TABLE IF NOT EXISTS orders (
  oid INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  address TEXT NOT NULL,
  total REAL NOT NULL,
  user_email TEXT,
  currency TEXT,
  merchant_email TEXT,
  salt TEXT,
  digest TEXT,
  paypal_order_id TEXT,
  capture_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'CREATED'
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

CREATE TABLE IF NOT EXISTS paypal_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT,
  paypal_order_id TEXT,
  capture_id TEXT,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_order_id ON orders(paypal_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_capture_id ON orders(capture_id);

CREATE TABLE IF NOT EXISTS users (
  userid INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS user_sessions (
  sid TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  user_email TEXT NOT NULL,
  role TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(userid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked ON user_sessions(revoked_at);

CREATE TABLE IF NOT EXISTS password_resets (
  rid INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(userid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_used_at ON password_resets(used_at);

-- 初始用户数据 (密码均为 'password123' 的 bcrypt 哈希值)
INSERT INTO users (email, password, role) VALUES 
('admin@example.com', '$2b$10$7R5vL7rI9.S0A9G5E2P7.O1l2Z3m4n5o6p7q8r9s0t1u2v3w4x5y6', 'admin'),
('user@example.com', '$2b$10$7R5vL7rI9.S0A9G5E2P7.O1l2Z3m4n5o6p7q8r9s0t1u2v3w4x5y6', 'user');