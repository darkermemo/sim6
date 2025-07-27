#!/usr/bin/env python3
"""
Simple NetFlow v9 test for SIEM Flow Collector
"""

import socket
import struct
import time
import json

def create_simple_netflow_packet():
    """Create a minimal NetFlow v9 packet for testing"""
    
    # NetFlow v9 Header (20 bytes)
    version = 9
    count = 1  # 1 flowset
    sys_uptime = int(time.time() * 1000) % 0xFFFFFFFF
    unix_secs = int(time.time())
    sequence = 1
    source_id = 12345
    
    header = struct.pack('>HHHIII',
        version, count, sys_uptime, unix_secs, sequence, source_id)
    
    # Template FlowSet (ID 0)
    template_id = 256
    field_count = 7
    template_header = struct.pack('>HH', 0, 4 + 4 + (field_count * 4))  # flowset_id, length
    template_record = struct.pack('>HH', template_id, field_count)  # template_id, field_count
    
    # Template fields: (type, length)
    fields = [
        (8, 4),   # IPV4_SRC_ADDR
        (12, 4),  # IPV4_DST_ADDR  
        (7, 2),   # L4_SRC_PORT
        (11, 2),  # L4_DST_PORT
        (4, 1),   # PROTOCOL
        (1, 4),   # IN_BYTES
        (2, 4),   # IN_PKTS
    ]
    
    template_fields = b''
    for field_type, field_length in fields:
        template_fields += struct.pack('>HH', field_type, field_length)
    
    template_flowset = template_header + template_record + template_fields
    
    return header + template_flowset

def create_data_packet():
    """Create a data packet with flow records"""
    
    # NetFlow v9 Header
    version = 9
    count = 1
    sys_uptime = int(time.time() * 1000) % 0xFFFFFFFF
    unix_secs = int(time.time())
    sequence = 2
    source_id = 12345
    
    header = struct.pack('>HHHIII',
        version, count, sys_uptime, unix_secs, sequence, source_id)
    
    # Data FlowSet (template_id = 256)
    template_id = 256
    record_length = 4 + 4 + 2 + 2 + 1 + 4 + 4  # 21 bytes
    num_records = 2
    flowset_length = 4 + (num_records * record_length)
    
    data_header = struct.pack('>HH', template_id, flowset_length)
    
    # Flow records
    records = b''
    
    # Record 1: 192.168.1.100:12345 -> 8.8.8.8:53 UDP
    src_ip = struct.unpack('!I', socket.inet_aton('192.168.1.100'))[0]
    dst_ip = struct.unpack('!I', socket.inet_aton('8.8.8.8'))[0]
    record1 = struct.pack('>IIHHIBII',
        src_ip, dst_ip, 12345, 53, 17, 1024, 10)
    records += record1
    
    # Record 2: 10.0.0.5:8080 -> 1.1.1.1:443 TCP  
    src_ip = struct.unpack('!I', socket.inet_aton('10.0.0.5'))[0]
    dst_ip = struct.unpack('!I', socket.inet_aton('1.1.1.1'))[0]
    record2 = struct.pack('>IIHHIBII',
        src_ip, dst_ip, 8080, 443, 6, 2048, 25)
    records += record2
    
    data_flowset = data_header + records
    
    return header + data_flowset

def test_flow_collector():
    """Test the flow collector"""
    
    print("Simple NetFlow v9 Test")
    print("Target: 127.0.0.1:2055")
    
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    
    try:
        # Send template packet
        template_packet = create_simple_netflow_packet()
        sock.sendto(template_packet, ('127.0.0.1', 2055))
        print(f"Sent template packet ({len(template_packet)} bytes)")
        
        # Wait for template processing
        time.sleep(0.5)
        
        # Send data packet
        data_packet = create_data_packet()
        sock.sendto(data_packet, ('127.0.0.1', 2055))
        print(f"Sent data packet ({len(data_packet)} bytes)")
        print("Test flows:")
        print("  1: 192.168.1.100:12345 -> 8.8.8.8:53 (UDP) 1024 bytes, 10 packets")
        print("  2: 10.0.0.5:8080 -> 1.1.1.1:443 (TCP) 2048 bytes, 25 packets")
        
        return True
        
    except Exception as e:
        print(f"Error: {e}")
        return False
    finally:
        sock.close()

if __name__ == '__main__':
    test_flow_collector() 