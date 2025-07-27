#!/usr/bin/env python3
import os
import time
import gzip
from datetime import datetime

def get_file_size(filepath):
    """Get file size in bytes"""
    try:
        return os.path.getsize(filepath)
    except FileNotFoundError:
        return 0

def count_lines_in_gzip(filepath):
    """Count lines in gzipped file"""
    try:
        with gzip.open(filepath, 'rt', encoding='utf-8') as f:
            count = 0
            for line in f:
                count += 1
                if count % 100000 == 0:  # Progress indicator for large files
                    print(f"   Counting... {count:,} lines so far")
            return count
    except FileNotFoundError:
        return 0
    except Exception as e:
        print(f"Error counting lines: {e}")
        return 0

def format_bytes(bytes_val):
    """Format bytes to human readable format"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_val < 1024.0:
            return f"{bytes_val:.2f} {unit}"
        bytes_val /= 1024.0
    return f"{bytes_val:.2f} PB"

def format_duration(seconds):
    """Format duration to human readable format"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"

def estimate_completion_time(current_size, target_size, rate_per_second):
    """Estimate completion time based on current rate"""
    if rate_per_second <= 0:
        return "Unknown"
    
    remaining_size = target_size - current_size
    remaining_seconds = remaining_size / rate_per_second
    
    return format_duration(remaining_seconds)

def main():
    """Monitor log generation progress"""
    filepath = "/Users/yasseralmohammed/sim6/massive_logs.txt.gz"
    target_size_gb = 200
    target_size_bytes = target_size_gb * 1024 * 1024 * 1024
    target_logs = 1_000_000_000
    
    print("📊 SIEM Log Generation Monitor")
    print("=" * 50)
    print(f"Target: {target_logs:,} logs or {target_size_gb} GB")
    print(f"File: {filepath}")
    print("=" * 50)
    
    start_time = time.time()
    last_size = 0
    last_time = start_time
    
    while True:
        try:
            current_time = time.time()
            current_size = get_file_size(filepath)
            
            # Calculate rates
            time_diff = current_time - last_time
            size_diff = current_size - last_size
            
            if time_diff > 0:
                rate_bytes_per_sec = size_diff / time_diff
                rate_mb_per_sec = rate_bytes_per_sec / (1024 * 1024)
            else:
                rate_bytes_per_sec = 0
                rate_mb_per_sec = 0
            
            # Calculate progress
            progress_percent = (current_size / target_size_bytes) * 100
            elapsed_time = current_time - start_time
            
            # Estimate completion
            eta = estimate_completion_time(current_size, target_size_bytes, rate_bytes_per_sec)
            
            # Display stats
            print(f"\r[{datetime.now().strftime('%H:%M:%S')}] "
                  f"Size: {format_bytes(current_size)} "
                  f"({progress_percent:.2f}%) | "
                  f"Rate: {rate_mb_per_sec:.2f} MB/s | "
                  f"Elapsed: {format_duration(elapsed_time)} | "
                  f"ETA: {eta}", end="", flush=True)
            
            # Update for next iteration
            last_size = current_size
            last_time = current_time
            
            # Check if target reached
            if current_size >= target_size_bytes:
                print("\n🎉 Target size reached!")
                break
            
            # Sleep before next check
            time.sleep(5)
            
        except KeyboardInterrupt:
            print("\n\n⏹️  Monitoring stopped by user")
            break
        except Exception as e:
            print(f"\nError: {e}")
            time.sleep(5)
    
    # Final statistics
    print("\n" + "=" * 50)
    print("📈 FINAL STATISTICS")
    final_size = get_file_size(filepath)
    total_time = time.time() - start_time
    
    print(f"Final size: {format_bytes(final_size)}")
    print(f"Total time: {format_duration(total_time)}")
    print(f"Average rate: {(final_size / (1024*1024)) / total_time:.2f} MB/s")
    
    # Count lines (this might take a while for large files)
    print("\n🔢 Counting total log entries...")
    line_count = count_lines_in_gzip(filepath)
    print(f"Total log entries: {line_count:,}")
    
    if line_count > 0:
        avg_log_size = final_size / line_count
        print(f"Average log size: {avg_log_size:.2f} bytes")
    
    print("=" * 50)

if __name__ == "__main__":
    main()