use std::net::{TcpListener, TcpStream};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub struct TestServer {
    pub base: String,
    #[allow(dead_code)]
    child: std::process::Child,
}

impl TestServer {
    #[allow(dead_code)]
    pub fn shutdown(&mut self) {
        let _ = self.child.kill();
    }
}

pub fn spawn_server(envs: &[(&str, &str)]) -> anyhow::Result<TestServer> {
    // Pick an ephemeral port by binding to 127.0.0.1:0 first
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let addr = listener.local_addr()?;
    drop(listener);

    let mut cmd = Command::new("cargo");
    cmd.arg("run").arg("--bin").arg("siem-pipeline")
        .env("BIND_ADDR", format!("{}:{}", addr.ip(), addr.port()))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (k, v) in envs { cmd.env(k, v); }
    let mut child = cmd.spawn()?;

    // Wait for TCP accept (lightweight readiness)
    let base = format!("http://{}", addr);
    let t0 = Instant::now();
    while t0.elapsed() < Duration::from_secs(10) {
        if TcpStream::connect(addr).is_ok() { return Ok(TestServer { base, child }); }
        std::thread::sleep(Duration::from_millis(100));
    }
    // If not healthy, dump some output and fail
    let _ = child.kill();
    anyhow::bail!("server failed to start on {}", addr)
}


