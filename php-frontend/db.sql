CREATE DATABASE router_db;
USE router_db;

CREATE TABLE IF NOT EXISTS  users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    password VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS  routes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    from_address VARCHAR(255),
    to_address VARCHAR(255),
    mode ENUM('car','walk','public'),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS route_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    route_type ENUM('simple', 'smart') NOT NULL DEFAULT 'simple',
    start_point VARCHAR(500) NOT NULL,
    end_point VARCHAR(500),
    categories TEXT,
    time_limit INT,
    transport_mode VARCHAR(50),
    route_data LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
);
