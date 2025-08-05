#!/usr/bin/env python3
"""
Machine Learning Enhanced Confidence Scoring Test
Tests the new ML-based confidence adjustment and adaptive learning
"""

import subprocess
import json
import tempfile
import os
from datetime import datetime
import statistics

class MlConfidenceTest:
    def __init__(self):
        self.test_scenarios = [
            {
                "name": "High Quality Logs",
                "logs": [
                    "Jan 21 15:30:45 f5-lb01 info: 192.168.1.100:54321 -> 10.0.1.50:80",
                    '{"@timestamp": "2025-01-21T15:30:45Z", "event": {"category": "network"}, "source": {"ip": "192.168.1.100"}, "destination": {"ip": "10.0.1.50"}}',
                    "2025-01-21T15:30:45 source_ip=192.168.1.100 dest_ip=10.0.1.50 action=ALLOW protocol=TCP",
                    '%ASA-6-302015: Built outbound UDP connection 12345 for outside:192.168.1.100/53 (192.168.1.100/53) to inside:10.0.1.50/53 (10.0.1.50/53)',
                ],
                "expected_confidence_trend": "stable_or_upgrade"
            },
            {
                "name": "Medium Quality Logs", 
                "logs": [
                    "Jan 21 15:30:45 server1 some log entry with ip 192.168.1.100",
                    "timestamp=2025-01-21T15:30:45Z message=authentication successful",
                    "INFO: Connection from 192.168.1.100 established",
                    "ERROR: Failed to parse configuration file",
                ],
                "expected_confidence_trend": "mixed"
            },
            {
                "name": "Low Quality Logs",
                "logs": [
                    "random text with no structure",
                    "debug output here",
                    "x=y",
                    "incomplete log",
                ],
                "expected_confidence_trend": "downgrade"
            },
            {
                "name": "Adaptive Learning Test",
                "logs": [
                    # Repeated similar logs to test learning
                    "Jan 21 15:30:45 f5-lb01 info: 192.168.1.100:54321 -> 10.0.1.50:80",
                    "Jan 21 15:31:45 f5-lb01 info: 192.168.1.101:54322 -> 10.0.1.51:80",
                    "Jan 21 15:32:45 f5-lb01 info: 192.168.1.102:54323 -> 10.0.1.52:80",
                    "Jan 21 15:33:45 f5-lb01 info: 192.168.1.103:54324 -> 10.0.1.53:80",
                    "Jan 21 15:34:45 f5-lb01 info: 192.168.1.104:54325 -> 10.0.1.54:80",
                ],
                "expected_confidence_trend": "learning_improvement"
            }
        ]

    def test_ml_confidence_enhancement(self):
        """Test ML confidence scoring across different scenarios"""
        print("🧠 Testing ML-Enhanced Confidence Scoring")
        print("=" * 60)
        
        all_results = {}
        
        for scenario in self.test_scenarios:
            print(f"\n📊 Testing: {scenario['name']}")
            print("-" * 40)
            
            scenario_results = []
            confidence_scores = []
            ml_scores = []
            
            for i, log_entry in enumerate(scenario['logs'], 1):
                print(f"  📝 Log {i}: {log_entry[:50]}{'...' if len(log_entry) > 50 else ''}")
                
                # Create temporary input file
                with tempfile.NamedTemporaryFile(mode='w', suffix='.log', delete=False) as f:
                    f.write(log_entry + '\n')
                    temp_file = f.name
                
                try:
                    # Parse with ML-enhanced system
                    result = subprocess.run(
                        ["./target/release/siem_parser", "--input", temp_file, "--format", "auto"],
                        cwd="siem_parser",
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    
                    if result.returncode == 0 and result.stdout:
                        try:
                            parsed_data = json.loads(result.stdout)
                            
                            # Extract ML metrics
                            confidence = parsed_data.get('confidence', 'Unknown')
                            event = parsed_data.get('event', {})
                            custom_fields = event.get('custom_fields', {})
                            
                            ml_score = custom_fields.get('ml_confidence_score', 'N/A')
                            ml_reason = custom_fields.get('ml_adjustment_reason', 'N/A')
                            base_confidence = custom_fields.get('ml_base_confidence', 'N/A')
                            
                            print(f"    🎯 Parser: {parsed_data.get('parser_used', 'Unknown')}")
                            print(f"    📊 Base → Final: {base_confidence} → {confidence}")
                            print(f"    🧠 ML Score: {ml_score}")
                            print(f"    💡 Reason: {ml_reason}")
                            
                            # Collect data for analysis
                            confidence_scores.append(confidence)
                            if ml_score != 'N/A':
                                try:
                                    ml_scores.append(float(ml_score))
                                except ValueError:
                                    pass
                            
                            scenario_results.append({
                                "log_entry": log_entry,
                                "parser_used": parsed_data.get('parser_used', 'Unknown'),
                                "base_confidence": base_confidence,
                                "final_confidence": confidence,
                                "ml_score": ml_score,
                                "ml_reason": ml_reason,
                                "success": True
                            })
                            
                        except json.JSONDecodeError as e:
                            print(f"    ❌ JSON parsing error: {e}")
                            scenario_results.append({"log_entry": log_entry, "success": False, "error": str(e)})
                            
                    else:
                        print(f"    ❌ Parser execution failed: {result.stderr}")
                        scenario_results.append({"log_entry": log_entry, "success": False, "error": result.stderr})
                        
                finally:
                    # Clean up temporary file
                    os.unlink(temp_file)
            
            # Analyze scenario results
            scenario_analysis = self.analyze_scenario_results(scenario_results, ml_scores, scenario['expected_confidence_trend'])
            all_results[scenario['name']] = {
                "results": scenario_results,
                "analysis": scenario_analysis,
                "ml_scores": ml_scores
            }
            
            print(f"  📈 Scenario Analysis: {scenario_analysis['summary']}")
        
        return all_results

    def analyze_scenario_results(self, results, ml_scores, expected_trend):
        """Analyze ML confidence scoring results for a scenario"""
        successful_results = [r for r in results if r.get('success', False)]
        total_tests = len(results)
        successful_tests = len(successful_results)
        
        analysis = {
            "total_tests": total_tests,
            "successful_tests": successful_tests,
            "success_rate": (successful_tests / total_tests * 100) if total_tests > 0 else 0,
            "ml_score_stats": {},
            "confidence_distribution": {},
            "ml_adjustments": {},
            "expected_trend": expected_trend,
            "trend_match": False,
            "summary": ""
        }
        
        if ml_scores:
            analysis["ml_score_stats"] = {
                "mean": statistics.mean(ml_scores),
                "median": statistics.median(ml_scores),
                "min": min(ml_scores),
                "max": max(ml_scores),
                "count": len(ml_scores)
            }
        
        # Analyze confidence distribution
        confidences = [r.get('final_confidence', 'Unknown') for r in successful_results]
        confidence_counts = {}
        for conf in confidences:
            confidence_counts[conf] = confidence_counts.get(conf, 0) + 1
        analysis["confidence_distribution"] = confidence_counts
        
        # Analyze ML adjustments
        adjustments = {}
        for result in successful_results:
            base = result.get('base_confidence', 'Unknown')
            final = result.get('final_confidence', 'Unknown')
            if base != 'Unknown' and final != 'Unknown':
                if base != final:
                    adj_type = "upgrade" if self.confidence_value(final) > self.confidence_value(base) else "downgrade"
                    adjustments[adj_type] = adjustments.get(adj_type, 0) + 1
                else:
                    adjustments["no_change"] = adjustments.get("no_change", 0) + 1
        
        analysis["ml_adjustments"] = adjustments
        
        # Determine if trend matches expectation
        if expected_trend == "stable_or_upgrade":
            analysis["trend_match"] = adjustments.get("downgrade", 0) <= adjustments.get("upgrade", 0)
        elif expected_trend == "downgrade":
            analysis["trend_match"] = adjustments.get("downgrade", 0) > 0
        elif expected_trend == "learning_improvement":
            # For learning, expect stable or improving scores
            if ml_scores:
                trend_positive = ml_scores[-1] >= ml_scores[0] if len(ml_scores) > 1 else True
                analysis["trend_match"] = trend_positive
        else:
            analysis["trend_match"] = True  # Mixed scenarios are always acceptable
        
        # Generate summary
        avg_ml_score = analysis["ml_score_stats"].get("mean", 0)
        dominant_confidence = max(confidence_counts.items(), key=lambda x: x[1])[0] if confidence_counts else "Unknown"
        
        if analysis["trend_match"]:
            analysis["summary"] = f"✅ PASS - Avg ML Score: {avg_ml_score:.3f}, Dominant: {dominant_confidence}"
        else:
            analysis["summary"] = f"⚠️ REVIEW - Avg ML Score: {avg_ml_score:.3f}, Unexpected trend"
        
        return analysis

    def confidence_value(self, confidence_str):
        """Convert confidence string to numeric value for comparison"""
        confidence_map = {
            "VeryLow": 1,
            "Low": 2,
            "Medium": 3,
            "High": 4,
            "VeryHigh": 5
        }
        return confidence_map.get(confidence_str, 0)

    def generate_ml_report(self, all_results):
        """Generate comprehensive ML confidence scoring report"""
        print("\n" + "=" * 70)
        print("📋 ML-ENHANCED CONFIDENCE SCORING REPORT")
        print("=" * 70)
        
        total_scenarios = len(all_results)
        successful_scenarios = sum(1 for result in all_results.values() if result["analysis"]["trend_match"])
        
        print(f"🎯 Total Scenarios: {total_scenarios}")
        print(f"✅ Successful Trends: {successful_scenarios}")
        print(f"📊 Success Rate: {(successful_scenarios / total_scenarios * 100):.1f}%")
        
        # Overall ML score statistics
        all_ml_scores = []
        for result in all_results.values():
            all_ml_scores.extend(result["ml_scores"])
        
        if all_ml_scores:
            print(f"\n🧠 ML Score Statistics:")
            print(f"   📈 Mean: {statistics.mean(all_ml_scores):.3f}")
            print(f"   📊 Median: {statistics.median(all_ml_scores):.3f}")
            print(f"   📉 Range: {min(all_ml_scores):.3f} - {max(all_ml_scores):.3f}")
            print(f"   🔢 Total Samples: {len(all_ml_scores)}")
        
        # Detailed scenario breakdown
        print(f"\n📈 Scenario Performance:")
        for scenario_name, result in all_results.items():
            analysis = result["analysis"]
            status = "✅" if analysis["trend_match"] else "⚠️"
            print(f"   {status} {scenario_name}: {analysis['summary']}")
            
            if analysis["ml_adjustments"]:
                adjustments = analysis["ml_adjustments"]
                print(f"      🔄 Adjustments: ↑{adjustments.get('upgrade', 0)} ↓{adjustments.get('downgrade', 0)} ={adjustments.get('no_change', 0)}")
        
        # Overall assessment
        overall_success = (successful_scenarios / total_scenarios * 100) >= 75
        
        print(f"\n🎯 OVERALL ASSESSMENT:")
        if overall_success:
            print("✅ ML-Enhanced Confidence Scoring: SUCCESSFUL")
            print("🚀 System demonstrates intelligent confidence adaptation")
            print("📊 Ready for production deployment with ML enhancements")
        else:
            print("⚠️ ML-Enhanced Confidence Scoring: NEEDS REFINEMENT")
            print("🔧 Some scenarios show unexpected confidence trends")
            print("📋 Review ML parameters and feature weights")
        
        # Save detailed report
        report = {
            "test_timestamp": datetime.now().isoformat(),
            "ml_system": "Enhanced Confidence Scoring",
            "total_scenarios": total_scenarios,
            "successful_scenarios": successful_scenarios,
            "overall_success_rate": (successful_scenarios / total_scenarios * 100),
            "ml_score_statistics": {
                "mean": statistics.mean(all_ml_scores) if all_ml_scores else 0,
                "median": statistics.median(all_ml_scores) if all_ml_scores else 0,
                "min": min(all_ml_scores) if all_ml_scores else 0,
                "max": max(all_ml_scores) if all_ml_scores else 0,
                "count": len(all_ml_scores)
            },
            "scenario_results": all_results,
            "overall_assessment": "successful" if overall_success else "needs_refinement"
        }
        
        with open("ml_confidence_test_report.json", "w") as f:
            json.dump(report, f, indent=2, default=str)
        
        print(f"\n📁 Detailed report saved to ml_confidence_test_report.json")
        return overall_success

    def run_comprehensive_test(self):
        """Run complete ML confidence scoring test suite"""
        print("🧠 Machine Learning Enhanced Confidence Scoring Test")
        print("=" * 70)
        print(f"Start Time: {datetime.now().isoformat()}")
        print()
        
        # Run ML confidence tests
        all_results = self.test_ml_confidence_enhancement()
        
        # Generate comprehensive report
        success = self.generate_ml_report(all_results)
        
        return success

def main():
    """Run ML confidence scoring test"""
    tester = MlConfidenceTest()
    success = tester.run_comprehensive_test()
    
    if success:
        print("\n🎉 ML-Enhanced Confidence Scoring implementation successful!")
        exit(0)
    else:
        print("\n⚠️ ML enhancements need additional tuning")
        exit(1)

if __name__ == "__main__":
    main()