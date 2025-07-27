#!/usr/bin/env python3
import os
import time
from datetime import datetime, timedelta

def format_bytes(bytes_val):
    """Format bytes to human readable format"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_val < 1024.0:
            return f"{bytes_val:.2f} {unit}"
        bytes_val /= 1024.0
    return f"{bytes_val:.2f} PB"

def estimate_completion(current_size, target_size, start_time):
    """Estimate completion time"""
    elapsed = time.time() - start_time
    if elapsed <= 0 or current_size <= 0:
        return "Unknown"
    
    rate = current_size / elapsed
    remaining = target_size - current_size
    remaining_time = remaining / rate
    
    completion_time = datetime.now() + timedelta(seconds=remaining_time)
    return completion_time.strftime("%Y-%m-%d %H:%M:%S")

def main():
    filepath = "/Users/yasseralmohammed/sim6/massive_logs.txt.gz"
    target_size_gb = 200
    target_size_bytes = target_size_gb * 1024 * 1024 * 1024
    target_logs = 1_000_000_000
    
    # Estimate start time (assuming it started around when the file was created)
    if os.path.exists(filepath):
        file_stats = os.stat(filepath)
        start_time = file_stats.st_ctime
        current_size = file_stats.st_size
        
        print("🚀 MASSIVE LOG GENERATION - PROGRESS UPDATE")
        print("=" * 60)
        print(f"📁 File: {filepath}")
        print(f"📊 Current Size: {format_bytes(current_size)}")
        print(f"🎯 Target Size: {format_bytes(target_size_bytes)}")
        
        progress_percent = (current_size / target_size_bytes) * 100
        print(f"📈 Progress: {progress_percent:.2f}%")
        
        elapsed_time = time.time() - start_time
        elapsed_hours = elapsed_time / 3600
        print(f"⏱️  Elapsed Time: {elapsed_hours:.2f} hours")
        
        if elapsed_time > 0:
            rate_mb_per_hour = (current_size / (1024 * 1024)) / elapsed_hours
            print(f"⚡ Generation Rate: {rate_mb_per_hour:.2f} MB/hour")
            
            # Estimate logs generated (assuming ~1KB average per log)
            estimated_logs = current_size / 1024
            print(f"📝 Estimated Logs: {estimated_logs:,.0f}")
            
            # Estimate completion
            eta = estimate_completion(current_size, target_size_bytes, start_time)
            print(f"🏁 Estimated Completion: {eta}")
        
        print("=" * 60)
        
        # Show recent file activity
        print("\n📋 Recent Activity:")
        print(f"   Last Modified: {datetime.fromtimestamp(file_stats.st_mtime).strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"   File Created: {datetime.fromtimestamp(file_stats.st_ctime).strftime('%Y-%m-%d %H:%M:%S')}")
        
    else:
        print("❌ Log file not found!")

if __name__ == "__main__":
    main()