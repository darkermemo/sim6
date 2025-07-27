#!/usr/bin/env python3
"""
OTRF Dataset Analyzer and Test Scenario Generator

This script analyzes OTRF Security Datasets metadata and creates
specific test scenarios based on MITRE ATT&CK techniques.
"""

import yaml
import json
import os
from pathlib import Path
from typing import List, Dict, Any
from collections import defaultdict

class OTRFDatasetAnalyzer:
    def __init__(self, datasets_path: str):
        self.datasets_path = Path(datasets_path)
        self.metadata_path = self.datasets_path / "datasets" / "atomic" / "_metadata"
        self.datasets_info = []
        self.attack_techniques = defaultdict(list)
        self.platforms = defaultdict(list)
        
    def analyze_metadata(self) -> Dict[str, Any]:
        """Analyze all YAML metadata files"""
        print("🔍 Analyzing OTRF Dataset Metadata")
        print("=" * 50)
        
        if not self.metadata_path.exists():
            print(f"❌ Metadata path not found: {self.metadata_path}")
            return {}
        
        yaml_files = list(self.metadata_path.glob("*.yaml"))
        print(f"Found {len(yaml_files)} metadata files")
        
        for yaml_file in yaml_files:
            try:
                with open(yaml_file, 'r') as f:
                    metadata = yaml.safe_load(f)
                    self.process_metadata(metadata, yaml_file.name)
            except Exception as e:
                print(f"Error processing {yaml_file.name}: {e}")
        
        return self.generate_analysis_report()
    
    def process_metadata(self, metadata: Dict[str, Any], filename: str):
        """Process individual metadata file"""
        dataset_info = {
            "id": metadata.get("id", filename),
            "title": metadata.get("title", "Unknown"),
            "description": metadata.get("description", ""),
            "platform": metadata.get("platform", "unknown"),
            "attack_techniques": [],
            "data_sources": [],
            "simulation_type": metadata.get("simulation", {}).get("type", "unknown"),
            "file_paths": []
        }
        
        # Extract ATT&CK techniques
        attack_data = metadata.get("attack_mappings", [])
        if isinstance(attack_data, list):
            for mapping in attack_data:
                if isinstance(mapping, dict):
                    technique = mapping.get("technique", "")
                    if technique:
                        dataset_info["attack_techniques"].append(technique)
                        self.attack_techniques[technique].append(dataset_info["id"])
        
        # Extract data sources
        datasets = metadata.get("datasets", [])
        if isinstance(datasets, list):
            for dataset in datasets:
                if isinstance(dataset, dict):
                    dataset_info["data_sources"].append(dataset.get("type", "unknown"))
                    
                    # Extract file paths
                    links = dataset.get("link", [])
                    if isinstance(links, list):
                        for link in links:
                            if isinstance(link, str) and link.endswith(".zip"):
                                dataset_info["file_paths"].append(link)
        
        # Categorize by platform
        platform = dataset_info["platform"]
        self.platforms[platform].append(dataset_info["id"])
        
        self.datasets_info.append(dataset_info)
    
    def generate_analysis_report(self) -> Dict[str, Any]:
        """Generate comprehensive analysis report"""
        report = {
            "summary": {
                "total_datasets": len(self.datasets_info),
                "platforms": dict(self.platforms),
                "attack_techniques": dict(self.attack_techniques),
                "top_techniques": self.get_top_techniques(10)
            },
            "datasets": self.datasets_info,
            "test_scenarios": self.generate_test_scenarios()
        }
        
        return report
    
    def get_top_techniques(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get most common ATT&CK techniques"""
        technique_counts = [(tech, len(datasets)) for tech, datasets in self.attack_techniques.items()]
        technique_counts.sort(key=lambda x: x[1], reverse=True)
        
        return [
            {"technique": tech, "dataset_count": count, "datasets": self.attack_techniques[tech]}
            for tech, count in technique_counts[:limit]
        ]
    
    def generate_test_scenarios(self) -> List[Dict[str, Any]]:
        """Generate specific test scenarios based on ATT&CK techniques"""
        scenarios = []
        
        # Scenario 1: Credential Access Testing
        cred_access_techniques = [tech for tech in self.attack_techniques.keys() 
                                if tech.startswith("T1003") or tech.startswith("T1558") or tech.startswith("T1110")]
        if cred_access_techniques:
            scenarios.append({
                "name": "Credential Access Detection",
                "description": "Test detection of credential dumping and access techniques",
                "techniques": cred_access_techniques[:3],
                "expected_alerts": ["Mimikatz Activity", "LSASS Access", "Credential Dumping"],
                "test_type": "detection"
            })
        
        # Scenario 2: Lateral Movement Testing
        lateral_movement = [tech for tech in self.attack_techniques.keys() 
                          if tech.startswith("T1021") or tech.startswith("T1047") or tech.startswith("T1076")]
        if lateral_movement:
            scenarios.append({
                "name": "Lateral Movement Detection",
                "description": "Test detection of lateral movement techniques",
                "techniques": lateral_movement[:3],
                "expected_alerts": ["Remote Execution", "WMI Activity", "Network Logon"],
                "test_type": "detection"
            })
        
        # Scenario 3: Persistence Testing
        persistence = [tech for tech in self.attack_techniques.keys() 
                     if tech.startswith("T1053") or tech.startswith("T1547") or tech.startswith("T1543")]
        if persistence:
            scenarios.append({
                "name": "Persistence Mechanism Detection",
                "description": "Test detection of persistence techniques",
                "techniques": persistence[:3],
                "expected_alerts": ["Scheduled Task", "Registry Modification", "Service Creation"],
                "test_type": "detection"
            })
        
        # Scenario 4: Multi-Platform Testing
        windows_datasets = [d for d in self.datasets_info if d["platform"] == "windows"]
        linux_datasets = [d for d in self.datasets_info if d["platform"] == "linux"]
        
        if windows_datasets and linux_datasets:
            scenarios.append({
                "name": "Multi-Platform Ingestion",
                "description": "Test ingestion and parsing across different platforms",
                "platforms": ["windows", "linux"],
                "datasets": {
                    "windows": [d["id"] for d in windows_datasets[:2]],
                    "linux": [d["id"] for d in linux_datasets[:2]]
                },
                "test_type": "ingestion"
            })
        
        # Scenario 5: High-Volume Testing
        large_datasets = [d for d in self.datasets_info if len(d["file_paths"]) > 0]
        if large_datasets:
            scenarios.append({
                "name": "High-Volume Data Processing",
                "description": "Test system performance with large datasets",
                "datasets": [d["id"] for d in large_datasets[:5]],
                "test_type": "performance",
                "metrics": ["ingestion_rate", "parsing_accuracy", "storage_efficiency"]
            })
        
        return scenarios
    
    def create_sigma_rules_for_techniques(self, techniques: List[str]) -> List[Dict[str, Any]]:
        """Create Sigma rules for specific ATT&CK techniques"""
        sigma_rules = []
        
        # Rule templates for common techniques
        rule_templates = {
            "T1003.001": {
                "title": "LSASS Memory Dump Detection",
                "description": "Detects attempts to dump LSASS memory for credential extraction",
                "logsource": {"category": "process_creation", "product": "windows"},
                "detection": {
                    "keywords": ["lsass", "procdump", "comsvcs.dll", "MiniDump"],
                    "condition": "keywords"
                },
                "level": "high"
            },
            "T1003.002": {
                "title": "Security Account Manager Access",
                "description": "Detects access to SAM database for credential extraction",
                "logsource": {"category": "file_access", "product": "windows"},
                "detection": {
                    "keywords": ["SAM", "SECURITY", "SYSTEM", "reg save"],
                    "condition": "keywords"
                },
                "level": "high"
            },
            "T1047": {
                "title": "WMI Process Execution",
                "description": "Detects process execution via WMI",
                "logsource": {"category": "process_creation", "product": "windows"},
                "detection": {
                    "keywords": ["wmic", "process call create", "Win32_Process"],
                    "condition": "keywords"
                },
                "level": "medium"
            },
            "T1053.005": {
                "title": "Scheduled Task Creation",
                "description": "Detects creation of scheduled tasks for persistence",
                "logsource": {"category": "process_creation", "product": "windows"},
                "detection": {
                    "keywords": ["schtasks", "/create", "Register-ScheduledTask"],
                    "condition": "keywords"
                },
                "level": "medium"
            }
        }
        
        for technique in techniques:
            if technique in rule_templates:
                template = rule_templates[technique]
                sigma_rule = {
                    "name": f"OTRF {template['title']}",
                    "sigma_yaml": f"""
title: {template['title']}
id: otrf-{technique.lower()}-001
status: experimental
description: {template['description']}
logsource:
    category: {template['logsource']['category']}
    product: {template['logsource']['product']}
detection:
    keywords:
{chr(10).join(f'        - "{keyword}"' for keyword in template['detection']['keywords'])}
    condition: {template['detection']['condition']}
falsepositives:
    - Administrative activities
    - Security tools
level: {template['level']}
tags:
    - attack.{technique.lower()}
"""
                }
                sigma_rules.append(sigma_rule)
        
        return sigma_rules
    
    def save_analysis_report(self, report: Dict[str, Any], filename: str = "otrf_analysis_report.json"):
        """Save analysis report to file"""
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2)
        print(f"📄 Analysis report saved: {filename}")
    
    def print_summary(self, report: Dict[str, Any]):
        """Print analysis summary"""
        summary = report["summary"]
        
        print("\n📊 OTRF Dataset Analysis Summary")
        print("=" * 50)
        print(f"Total Datasets: {summary['total_datasets']}")
        
        print("\n🖥️ Platforms:")
        for platform, datasets in summary["platforms"].items():
            print(f"  {platform}: {len(datasets)} datasets")
        
        print("\n🎯 Top ATT&CK Techniques:")
        for technique_info in summary["top_techniques"][:5]:
            print(f"  {technique_info['technique']}: {technique_info['dataset_count']} datasets")
        
        print(f"\n🧪 Generated Test Scenarios: {len(report['test_scenarios'])}")
        for scenario in report["test_scenarios"]:
            print(f"  - {scenario['name']} ({scenario['test_type']})")

def main():
    """Main execution function"""
    datasets_path = "/Users/yasseralmohammed/sim6/Security-Datasets"
    
    analyzer = OTRFDatasetAnalyzer(datasets_path)
    report = analyzer.analyze_metadata()
    
    if report:
        analyzer.print_summary(report)
        analyzer.save_analysis_report(report)
        
        # Generate Sigma rules for top techniques
        top_techniques = [t["technique"] for t in report["summary"]["top_techniques"][:5]]
        sigma_rules = analyzer.create_sigma_rules_for_techniques(top_techniques)
        
        if sigma_rules:
            print(f"\n📋 Generated {len(sigma_rules)} Sigma rules for testing")
            with open("otrf_sigma_rules.json", 'w') as f:
                json.dump(sigma_rules, f, indent=2)
            print("📄 Sigma rules saved: otrf_sigma_rules.json")
        
        print("\n✅ OTRF Dataset analysis completed successfully!")
    else:
        print("❌ Failed to analyze OTRF datasets")

if __name__ == "__main__":
    main()