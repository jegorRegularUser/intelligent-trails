CREATE DATABASE router_db;
USE router_db;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    password VARCHAR(255)
);

CREATE TABLE routes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    from_address VARCHAR(255),
    to_address VARCHAR(255),
    mode ENUM('car','walk','public'),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
