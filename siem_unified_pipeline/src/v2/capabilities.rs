use std::sync::OnceLock;

static CAP_IPCIDR: OnceLock<bool> = OnceLock::new();

/// Set availability of ipCIDRMatch() function in ClickHouse (boot-time probe).
pub fn set_ipcidr_available(v: bool) {
    let _ = CAP_IPCIDR.set(v);
}

/// Returns whether ipCIDRMatch() is available in the target ClickHouse.
/// Defaults to true when not probed yet.
pub fn ipcidr_available() -> bool {
    *CAP_IPCIDR.get_or_init(|| true)
}


