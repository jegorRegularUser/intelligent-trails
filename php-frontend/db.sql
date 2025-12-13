CREATE DATABASE IF NOT EXISTS router_db;
USE router_db;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    password VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS routes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    from_address VARCHAR(255),
    to_address VARCHAR(255),
    mode ENUM('car','walk','public'),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS saved_routes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    route_name VARCHAR(255) NOT NULL DEFAULT 'Мой маршрут',
    route_type ENUM('simple', 'smart', 'smart_walk') NOT NULL DEFAULT 'simple',
    
    start_point VARCHAR(500),
    end_point VARCHAR(500),
    waypoints TEXT,
    
    categories TEXT,
    time_limit INT,
    transport_mode VARCHAR(50) DEFAULT 'pedestrian',
    return_to_start BOOLEAN DEFAULT FALSE,
    min_places_per_category TEXT,
    
    pace VARCHAR(20) DEFAULT 'balanced',
    time_strictness INT DEFAULT 5,
    
    route_data LONGTEXT,
    
    total_distance DECIMAL(10,2),
    total_time INT,
    places_count INT DEFAULT 0,
    
    is_favorite BOOLEAN DEFAULT FALSE,
    tags TEXT,
    description TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NULL,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_route_type (route_type),
    INDEX idx_created_at (created_at),
    INDEX idx_is_favorite (is_favorite),
    INDEX idx_last_used (last_used_at)
);

CREATE TABLE IF NOT EXISTS route_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    route_type ENUM('simple', 'smart', 'smart_walk') NOT NULL DEFAULT 'simple',
    start_point VARCHAR(500) NOT NULL,
    end_point VARCHAR(500),
    categories TEXT,
    time_limit INT,
    transport_mode VARCHAR(50),
    route_data LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
);
