use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use log::{info, warn, error};
use crate::connection_manager::ConnectionManager;

#[allow(dead_code)]
pub struct TcpLogReceiver {
    listener: TcpListener,
    connection_manager: Arc<ConnectionManager>,
}

impl TcpLogReceiver {
    #[allow(dead_code)]
    pub async fn new(bind_addr: &str, connection_manager: Arc<ConnectionManager>) -> Result<Self, Box<dyn std::error::Error>> {
        let listener = TcpListener::bind(bind_addr).await?;
        info!("TCP log receiver listening on {}", bind_addr);
        
        Ok(Self {
            listener,
            connection_manager,
        })
    }

    #[allow(dead_code)]
    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        loop {
            match self.listener.accept().await {
                Ok((stream, addr)) => {
                    let connection_manager = Arc::clone(&self.connection_manager);
                    info!("New TCP connection from {}", addr);
                    
                    // Spawn a task to handle this connection
                    tokio::spawn(async move {
                        if let Err(e) = handle_connection(stream, addr.ip().to_string(), connection_manager).await {
                            error!("Error handling connection from {}: {}", addr, e);
                        }
                    });
                }
                Err(e) => {
                    error!("Failed to accept TCP connection: {}", e);
                }
            }
        }
    }
}

#[allow(dead_code)]
async fn handle_connection(
    mut stream: TcpStream,
    source_ip: String,
    connection_manager: Arc<ConnectionManager>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Send acknowledgment to establish connection
    stream.write_all(b"SIEM-ACK: Ready to receive logs\n").await?;
    stream.flush().await?;
    
    info!("Connection established with {}", source_ip);
    
    let mut buffer = vec![0; 8192];
    let mut incomplete_message = String::new();
    
    loop {
        match stream.read(&mut buffer).await {
            Ok(0) => {
                // Connection closed by client
                info!("Connection closed by {}", source_ip);
                connection_manager.update_source_status(&source_ip, "disconnected");
                break;
            }
            Ok(n) => {
                let data = String::from_utf8_lossy(&buffer[..n]);
                incomplete_message.push_str(&data);
                
                // Process complete messages (assuming newline-delimited)
                while let Some(newline_pos) = incomplete_message.find('\n') {
                    let message = incomplete_message[..newline_pos].trim().to_string();
                    incomplete_message = incomplete_message[newline_pos + 1..].to_string();
                    
                    if !message.is_empty() {
                        // Register the event with connection manager
                        connection_manager.register_event(&source_ip, message.len());
                        
                        // TODO: Forward to Kafka or process directly
                        info!("Received log from {}: {} bytes", source_ip, message.len());
                        
                        // Send acknowledgment for each message
                        if let Err(e) = stream.write_all(b"ACK\n").await {
                            warn!("Failed to send ACK to {}: {}", source_ip, e);
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                error!("Error reading from {}: {}", source_ip, e);
                connection_manager.update_source_status(&source_ip, "disconnected");
                break;
            }
        }
    }
    
    Ok(())
}