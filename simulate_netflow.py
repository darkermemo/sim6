#!/usr/bin/env python3
"""
NetFlow v9 Simulator for testing SIEM Flow Collector
Generates realistic NetFlow v9 packets and sends them via UDP
"""

import socket
import struct
import time
import random
import ipaddress
from datetime import datetime
import argparse
import sys

class NetFlowV9Simulator:
    def __init__(self, target_host="127.0.0.1", target_port=2055):
        self.target_host = target_host
        self.target_port = target_port
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sequence_number = 0
        self.source_id = random.randint(1, 0xFFFFFFFF)
        self.template_id = 256  # Data template ID
        
        print(f"NetFlow v9 Simulator initialized")
        print(f"Target: {target_host}:{target_port}")
        print(f"Source ID: {self.source_id}")

    def create_netflow_header(self, count):
        """Create NetFlow v9 header"""
        version = 9
        sys_uptime = int(time.time() * 1000) % 0xFFFFFFFF  # Milliseconds
        unix_secs = int(time.time())
        
        header = struct.pack('>HHHIII',
            version,           # Version (9)
            count,             # Count of records
            sys_uptime,        # System uptime in ms
            unix_secs,         # Unix timestamp
            self.sequence_number,  # Sequence number
            self.source_id     # Source ID
        )
        
        self.sequence_number += count
        return header

    def create_template_flowset(self):
        """Create template flowset for NetFlow v9"""
        # Template flowset header
        flowset_id = 0  # Template flowset
        fields = [
            (8, 4),   # IPV4_SRC_ADDR (4 bytes)
            (12, 4),  # IPV4_DST_ADDR (4 bytes)
            (7, 2),   # L4_SRC_PORT (2 bytes)
            (11, 2),  # L4_DST_PORT (2 bytes)
            (4, 1),   # PROTOCOL (1 byte)
            (1, 4),   # IN_BYTES (4 bytes)
            (2, 4),   # IN_PKTS (4 bytes)
            (22, 4),  # FIRST_SWITCHED (4 bytes)
            (21, 4),  # LAST_SWITCHED (4 bytes)
            (6, 1),   # TCP_FLAGS (1 byte)
            (5, 1),   # SRC_TOS (1 byte)
        ]
        
        field_count = len(fields)
        template_length = 4 + 4 + (field_count * 4)  # Header + template header + fields
        
        # Template flowset header
        flowset_header = struct.pack('>HH', flowset_id, template_length)
        
        # Template record header
        template_header = struct.pack('>HH', self.template_id, field_count)
        
        # Template fields
        template_fields = b''
        for field_type, field_length in fields:
            template_fields += struct.pack('>HH', field_type, field_length)
        
        return flowset_header + template_header + template_fields

    def create_data_flowset(self, flows):
        """Create data flowset with flow records"""
        flowset_id = self.template_id  # Data template ID
        
        # Calculate record length based on template
        record_length = 4 + 4 + 2 + 2 + 1 + 4 + 4 + 4 + 4 + 1 + 1  # 30 bytes per record
        flowset_length = 4 + (len(flows) * record_length)  # Header + records
        
        # Data flowset header
        flowset_header = struct.pack('>HH', flowset_id, flowset_length)
        
        # Flow records
        records_data = b''
        current_time = int(time.time())
        
        for flow in flows:
            # Convert IP addresses to binary
            src_ip = struct.unpack('!I', socket.inet_aton(flow['src_ip']))[0]
            dst_ip = struct.unpack('!I', socket.inet_aton(flow['dst_ip']))[0]
            
            # Create flow record
            record = struct.pack('>IIHHIBIIBB',
                src_ip,                    # IPV4_SRC_ADDR
                dst_ip,                    # IPV4_DST_ADDR
                flow['src_port'],          # L4_SRC_PORT
                flow['dst_port'],          # L4_DST_PORT
                flow['protocol'],          # PROTOCOL
                min(flow['bytes'], 0xFFFFFFFF),     # IN_BYTES (4 bytes max)
                min(flow['packets'], 0xFFFFFFFF),   # IN_PKTS (4 bytes max)
                current_time - flow['duration'],   # FIRST_SWITCHED
                current_time,              # LAST_SWITCHED
                flow.get('tcp_flags', 0),  # TCP_FLAGS
                flow.get('tos', 0),        # SRC_TOS
            )
            records_data += record
        
        return flowset_header + records_data

    def generate_realistic_flows(self, count=10):
        """Generate realistic network flows"""
        flows = []
        protocols = {6: 'TCP', 17: 'UDP', 1: 'ICMP'}
        common_ports = [80, 443, 22, 53, 25, 110, 143, 993, 995, 21, 23, 3389]
        
        # Internal network ranges
        internal_ranges = [
            '192.168.1.0/24',
            '10.0.0.0/24',
            '172.16.0.0/24'
        ]
        
        # External IPs (simulated)
        external_ips = [
            '8.8.8.8', '1.1.1.1', '208.67.222.222',
            '93.184.216.34', '151.101.193.140'
        ]
        
        for i in range(count):
            # Determine if this is internal->external or internal->internal
            is_outbound = random.choice([True, True, False])  # Bias toward outbound
            
            if is_outbound:
                # Internal -> External
                internal_net = random.choice(internal_ranges)
                src_ip = str(list(ipaddress.IPv4Network(internal_net).hosts())[random.randint(0, 10)])
                dst_ip = random.choice(external_ips)
                src_port = random.randint(32768, 65000)  # Ephemeral port
                dst_port = random.choice(common_ports)
            else:
                # Internal -> Internal
                internal_net = random.choice(internal_ranges)
                hosts = list(ipaddress.IPv4Network(internal_net).hosts())
                src_ip = str(hosts[random.randint(0, min(10, len(hosts)-1))])
                dst_ip = str(hosts[random.randint(0, min(10, len(hosts)-1))])
                src_port = random.randint(32768, 65000)
                dst_port = random.choice(common_ports)
            
            protocol = random.choice([6, 17])  # TCP or UDP
            
                    # Generate realistic traffic patterns
        if dst_port == 80 or dst_port == 443:  # HTTP/HTTPS
            bytes_count = random.randint(1000, 10000)
            packets = random.randint(10, 100)
        elif dst_port == 53:  # DNS
            bytes_count = random.randint(50, 500)
            packets = random.randint(1, 5)
        elif dst_port == 22:  # SSH
            bytes_count = random.randint(500, 5000)
            packets = random.randint(5, 50)
        else:
            bytes_count = random.randint(100, 5000)
            packets = random.randint(1, 20)
            
            flow = {
                'src_ip': src_ip,
                'dst_ip': dst_ip,
                'src_port': src_port,
                'dst_port': dst_port,
                'protocol': protocol,
                'bytes': bytes_count,
                'packets': packets,
                'duration': random.randint(1, 300),  # 1-300 seconds
                'tcp_flags': random.randint(0, 31) if protocol == 6 else 0,
                'tos': 0
            }
            flows.append(flow)
        
        return flows

    def send_flows(self, flows):
        """Send NetFlow v9 packet with template and data"""
        try:
            # Create template packet first
            template_header = self.create_netflow_header(1)  # 1 flowset
            template_flowset = self.create_template_flowset()
            template_packet = template_header + template_flowset
            
            # Send template
            self.socket.sendto(template_packet, (self.target_host, self.target_port))
            print(f"Sent template flowset ({len(template_packet)} bytes)")
            
            # Wait a bit for template to be processed
            time.sleep(0.1)
            
            # Create and send data packet
            data_header = self.create_netflow_header(1)  # 1 flowset
            data_flowset = self.create_data_flowset(flows)
            data_packet = data_header + data_flowset
            
            self.socket.sendto(data_packet, (self.target_host, self.target_port))
            print(f"Sent {len(flows)} flow records ({len(data_packet)} bytes)")
            
            return True
            
        except Exception as e:
            print(f"Error sending flows: {e}")
            return False

    def simulate_continuous_traffic(self, flows_per_packet=5, interval=2.0, duration=60):
        """Simulate continuous NetFlow traffic"""
        print(f"Starting continuous simulation:")
        print(f"  {flows_per_packet} flows per packet")
        print(f"  {interval}s interval between packets")
        print(f"  {duration}s total duration")
        print()
        
        start_time = time.time()
        packet_count = 0
        total_flows = 0
        
        while time.time() - start_time < duration:
            flows = self.generate_realistic_flows(flows_per_packet)
            
            if self.send_flows(flows):
                packet_count += 1
                total_flows += len(flows)
                print(f"Packet {packet_count}: {len(flows)} flows sent (total: {total_flows})")
            
            time.sleep(interval)
        
        print(f"\nSimulation complete:")
        print(f"  Packets sent: {packet_count}")
        print(f"  Total flows: {total_flows}")
        print(f"  Duration: {time.time() - start_time:.1f}s")

    def close(self):
        """Close the socket"""
        self.socket.close()

def main():
    parser = argparse.ArgumentParser(description='NetFlow v9 Simulator for SIEM testing')
    parser.add_argument('--host', default='127.0.0.1', help='Target host (default: 127.0.0.1)')
    parser.add_argument('--port', type=int, default=2055, help='Target port (default: 2055)')
    parser.add_argument('--flows', type=int, default=10, help='Flows per packet (default: 10)')
    parser.add_argument('--interval', type=float, default=2.0, help='Interval between packets in seconds (default: 2.0)')
    parser.add_argument('--duration', type=int, default=60, help='Total simulation duration in seconds (default: 60)')
    parser.add_argument('--single', action='store_true', help='Send single packet and exit')
    
    args = parser.parse_args()
    
    simulator = NetFlowV9Simulator(args.host, args.port)
    
    try:
        if args.single:
            # Send single packet
            flows = simulator.generate_realistic_flows(args.flows)
            print(f"Generated {len(flows)} flows:")
            for i, flow in enumerate(flows):
                print(f"  {i+1}: {flow['src_ip']}:{flow['src_port']} -> {flow['dst_ip']}:{flow['dst_port']} "
                      f"({flow['protocol']}) {flow['bytes']} bytes, {flow['packets']} packets")
            
            simulator.send_flows(flows)
        else:
            # Continuous simulation
            simulator.simulate_continuous_traffic(
                flows_per_packet=args.flows,
                interval=args.interval,
                duration=args.duration
            )
    
    except KeyboardInterrupt:
        print("\nSimulation interrupted by user")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        simulator.close()

if __name__ == '__main__':
    main() 