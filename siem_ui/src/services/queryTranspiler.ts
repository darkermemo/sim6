/**
 * SPL to SQL Query Transpiler Service
 * 
 * Converts Splunk-style SPL queries to ClickHouse SQL queries
 * for the SIEM event investigation system.
 * 
 * Supported SPL Commands:
 * - Base search: event_category = "Network"
 * - Stats: stats count by dest_ip, stats avg(bytes_out) by source_ip
 * - Sort: sort -timestamp, sort +count
 * - Limit: limit 10, head 5, tail 5
 * - Top: top 10 dest_ip, top limit=5 user
 * - Where: where user != "admin"
 * - Eval: eval new_field = source_ip + ":" + dest_ip
 * - Fields: fields timestamp, source_ip, dest_ip
 * - Dedup: dedup source_ip
 */

export interface ParsedCommand {
  type: 'search' | 'stats' | 'sort' | 'limit' | 'top' | 'where' | 'eval' | 'fields' | 'dedup' | 'head' | 'tail';
  raw: string;
  parsed: {
    operation?: string;
    field?: string;
    fields?: string[];
    value?: string;
    direction?: 'asc' | 'desc';
    count?: number;
    by?: string[];
    aggregation?: string;
    expression?: string;
    condition?: string;
  };
}

export interface TranspilerResult {
  sql: string;
  commands: ParsedCommand[];
  isValid: boolean;
  errors: string[];
}

/**
 * Main transpiler class for converting SPL to SQL
 */
export class QueryTranspiler {
  private static readonly CIM_FIELDS = [
    'event_category', 'event_action', 'event_outcome', 'event_timestamp',
    'user', 'src_user', 'dest_user', 'source_ip', 'dest_ip', 'src_port', 'dest_port',
    'protocol', 'bytes_in', 'bytes_out', 'packets_in', 'packets_out',
    'file_name', 'file_path', 'file_hash', 'process_name', 'command_line',
    'registry_key', 'registry_value', 'service_name', 'auth_method',
    'failure_reason', 'session_id', 'threat_category', 'severity', 'priority',
    'is_threat', 'app_name', 'email_sender', 'email_recipient', 'tags', 'message'
  ];

  /**
   * Transpile SPL query to SQL
   */
  public static transpile(splQuery: string): TranspilerResult {
    const errors: string[] = [];
    const commands: ParsedCommand[] = [];

    try {
      // Split query by pipes and parse each command
      const parts = splQuery.split('|').map(part => part.trim()).filter(Boolean);
      
      if (parts.length === 0) {
        return {
          sql: 'SELECT * FROM dev.events',
          commands: [],
          isValid: true,
          errors: []
        };
      }

      // Parse each command
      for (let i = 0; i < parts.length; i++) {
        try {
          const command = this.parseCommand(parts[i]);
          commands.push(command);
        } catch (error) {
          errors.push(`Command ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Generate SQL from parsed commands
      const sql = this.generateSQL(commands);

      return {
        sql,
        commands,
        isValid: errors.length === 0,
        errors
      };
    } catch (error) {
      errors.push(`Transpiler error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        sql: 'SELECT * FROM dev.events',
        commands,
        isValid: false,
        errors
      };
    }
  }

  /**
   * Parse individual SPL command
   */
  private static parseCommand(commandStr: string): ParsedCommand {
    const cmd = commandStr.trim();
    const lowerCmd = cmd.toLowerCase();

    // Detect command type
    let type: ParsedCommand['type'] = 'search';
    if (lowerCmd.startsWith('stats ')) type = 'stats';
    else if (lowerCmd.startsWith('sort ')) type = 'sort';
    else if (lowerCmd.startsWith('limit ') || lowerCmd.startsWith('head ')) type = 'limit';
    else if (lowerCmd.startsWith('tail ')) type = 'tail';
    else if (lowerCmd.startsWith('top ')) type = 'top';
    else if (lowerCmd.startsWith('where ')) type = 'where';
    else if (lowerCmd.startsWith('eval ')) type = 'eval';
    else if (lowerCmd.startsWith('fields ')) type = 'fields';
    else if (lowerCmd.startsWith('dedup ')) type = 'dedup';

    // Parse based on type
    const parsed = this.parseCommandByType(cmd, type);

    return {
      type,
      raw: cmd,
      parsed
    };
  }

  /**
   * Parse command based on its type
   */
  private static parseCommandByType(cmd: string, type: ParsedCommand['type']) {
    switch (type) {
      case 'stats':
        return this.parseStatsCommand(cmd);
      case 'sort':
        return this.parseSortCommand(cmd);
      case 'limit':
      case 'head':
      case 'tail':
        return this.parseLimitCommand(cmd);
      case 'top':
        return this.parseTopCommand(cmd);
      case 'where':
        return this.parseWhereCommand(cmd);
      case 'eval':
        return this.parseEvalCommand(cmd);
      case 'fields':
        return this.parseFieldsCommand(cmd);
      case 'dedup':
        return this.parseDedupCommand(cmd);
      default:
        return this.parseSearchCommand(cmd);
    }
  }

  /**
   * Parse stats command: stats count by dest_ip, stats avg(bytes_out) by source_ip
   */
  private static parseStatsCommand(cmd: string) {
    const statsMatch = cmd.match(/stats\s+(\w+)(?:\(([^)]+)\))?\s*(?:by\s+(.+))?/i);
    if (!statsMatch) {
      throw new Error('Invalid stats syntax. Use: stats count by field or stats function(field) by field');
    }

    const operation = statsMatch[1].toLowerCase();
    const field = statsMatch[2];
    const byFields = statsMatch[3]?.split(',').map(f => f.trim()) || [];

    // Validate aggregation function
    const validAggregations = ['count', 'sum', 'avg', 'min', 'max', 'distinct'];
    if (!validAggregations.includes(operation)) {
      throw new Error(`Unsupported aggregation: ${operation}. Use: ${validAggregations.join(', ')}`);
    }

    return {
      operation,
      field: field || '*',
      by: byFields,
      aggregation: operation
    };
  }

  /**
   * Parse sort command: sort -timestamp, sort +count
   */
  private static parseSortCommand(cmd: string) {
    const sortMatch = cmd.match(/sort\s+([+-]?)(\w+)/i);
    if (!sortMatch) {
      throw new Error('Invalid sort syntax. Use: sort field or sort -field or sort +field');
    }

    const direction: "asc" | "desc" = sortMatch[1] === '-' ? 'desc' : 'asc';
    const field = sortMatch[2];

    return {
      field,
      direction
    };
  }

  /**
   * Parse limit/head/tail command: limit 10, head 5
   */
  private static parseLimitCommand(cmd: string) {
    const limitMatch = cmd.match(/(?:limit|head|tail)\s+(\d+)/i);
    if (!limitMatch) {
      throw new Error('Invalid limit syntax. Use: limit number or head number');
    }

    const count = parseInt(limitMatch[1]);
    if (count <= 0 || count > 10000) {
      throw new Error('Limit must be between 1 and 10000');
    }

    return {
      count
    };
  }

  /**
   * Parse top command: top 10 dest_ip, top limit=5 user
   */
  private static parseTopCommand(cmd: string) {
    const topMatch = cmd.match(/top\s+(?:limit=)?(\d+)\s+(\w+)/i);
    if (!topMatch) {
      throw new Error('Invalid top syntax. Use: top N field or top limit=N field');
    }

    const count = parseInt(topMatch[1]);
    const field = topMatch[2];

    return {
      count,
      field,
      operation: 'top'
    };
  }

  /**
   * Parse where command: where user != "admin"
   */
  private static parseWhereCommand(cmd: string) {
    const whereMatch = cmd.match(/where\s+(.+)/i);
    if (!whereMatch) {
      throw new Error('Invalid where syntax. Use: where condition');
    }

    return {
      condition: whereMatch[1],
      operation: 'filter'
    };
  }

  /**
   * Parse eval command: eval new_field = source_ip + ":" + dest_ip
   */
  private static parseEvalCommand(cmd: string) {
    const evalMatch = cmd.match(/eval\s+(.+)/i);
    if (!evalMatch) {
      throw new Error('Invalid eval syntax. Use: eval field = expression');
    }

    return {
      expression: evalMatch[1],
      operation: 'eval'
    };
  }

  /**
   * Parse fields command: fields timestamp, source_ip, dest_ip
   */
  private static parseFieldsCommand(cmd: string) {
    const fieldsMatch = cmd.match(/fields\s+(.+)/i);
    if (!fieldsMatch) {
      throw new Error('Invalid fields syntax. Use: fields field1, field2, field3');
    }

    const fields = fieldsMatch[1].split(',').map(f => f.trim()).filter(Boolean);
    return {
      fields,
      operation: 'select'
    };
  }

  /**
   * Parse dedup command: dedup source_ip
   */
  private static parseDedupCommand(cmd: string) {
    const dedupMatch = cmd.match(/dedup\s+(\w+)/i);
    if (!dedupMatch) {
      throw new Error('Invalid dedup syntax. Use: dedup field');
    }

    return {
      field: dedupMatch[1],
      operation: 'dedup'
    };
  }

  /**
   * Parse search command: event_category = "Network"
   */
  private static parseSearchCommand(cmd: string) {
    return {
      condition: cmd,
      operation: 'filter'
    };
  }

  /**
   * Generate ClickHouse SQL from parsed commands
   */
  private static generateSQL(commands: ParsedCommand[]): string {
    let selectClause = 'SELECT *';
    const fromClause = 'FROM dev.events';
    const whereConditions: string[] = [];
    let groupByClause = '';
    let orderByClause = '';
    let limitClause = '';
    const havingClause = '';

    // Process commands in order
    for (const command of commands) {
      switch (command.type) {
        case 'search':
        case 'where':
          if (command.parsed.condition) {
            whereConditions.push(this.convertConditionToSQL(command.parsed.condition));
          }
          break;

        case 'stats':
          if (command.parsed.operation && command.parsed.by) {
            const aggFunction = this.getAggregationFunction(command.parsed.operation, command.parsed.field || '*');
            const groupFields = command.parsed.by.join(', ');
            selectClause = `SELECT ${groupFields}, ${aggFunction} as ${command.parsed.operation}_result`;
            groupByClause = `GROUP BY ${groupFields}`;
          }
          break;

        case 'sort':
          if (command.parsed.field) {
            const direction = command.parsed.direction === 'desc' ? 'DESC' : 'ASC';
            orderByClause = `ORDER BY ${command.parsed.field} ${direction}`;
          }
          break;

        case 'limit':
        case 'head':
          if (command.parsed.count) {
            limitClause = `LIMIT ${command.parsed.count}`;
          }
          break;

        case 'tail':
          if (command.parsed.count) {
            // For tail, we need to sort in reverse and then limit
            if (!orderByClause) {
              orderByClause = 'ORDER BY event_timestamp DESC';
            }
            limitClause = `LIMIT ${command.parsed.count}`;
          }
          break;

        case 'top':
          if (command.parsed.field && command.parsed.count) {
            selectClause = `SELECT ${command.parsed.field}, count(*) as count`;
            groupByClause = `GROUP BY ${command.parsed.field}`;
            orderByClause = 'ORDER BY count DESC';
            limitClause = `LIMIT ${command.parsed.count}`;
          }
          break;

        case 'fields':
          if (command.parsed.fields && command.parsed.fields.length > 0) {
            selectClause = `SELECT ${command.parsed.fields.join(', ')}`;
          }
          break;

        case 'dedup':
          if (command.parsed.field) {
            // Use DISTINCT in ClickHouse
            selectClause = selectClause.replace('SELECT', 'SELECT DISTINCT');
          }
          break;
      }
    }

    // Assemble final SQL
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    return [
      selectClause,
      fromClause,
      whereClause,
      groupByClause,
      havingClause,
      orderByClause,
      limitClause
    ].filter(Boolean).join(' ');
  }

  /**
   * Convert SPL condition to SQL WHERE condition
   */
  private static convertConditionToSQL(condition: string): string {
    // Handle basic comparisons: field = "value", field != "value", etc.
    let sqlCondition = condition;

    // Convert SPL operators to SQL operators
    sqlCondition = sqlCondition.replace(/\s+AND\s+/gi, ' AND ');
    sqlCondition = sqlCondition.replace(/\s+OR\s+/gi, ' OR ');
    sqlCondition = sqlCondition.replace(/\s+NOT\s+/gi, ' NOT ');

    // Handle LIKE operations for contains
    sqlCondition = sqlCondition.replace(/(\w+)\s*=\s*\*([^*]+)\*/g, '$1 LIKE \'%$2%\'');
    sqlCondition = sqlCondition.replace(/(\w+)\s*!=\s*\*([^*]+)\*/g, '$1 NOT LIKE \'%$2%\'');

    return sqlCondition;
  }

  /**
   * Get ClickHouse aggregation function
   */
  private static getAggregationFunction(operation: string, field: string): string {
    switch (operation.toLowerCase()) {
      case 'count':
        return field === '*' ? 'count(*)' : `count(${field})`;
      case 'sum':
        return `sum(${field})`;
      case 'avg':
        return `avg(${field})`;
      case 'min':
        return `min(${field})`;
      case 'max':
        return `max(${field})`;
      case 'distinct':
        return `uniq(${field})`;
      default:
        return `count(*)`;
    }
  }

  /**
   * Validate field names against CIM schema
   */
  public static validateFields(fields: string[]): { valid: string[]; invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const field of fields) {
      if (this.CIM_FIELDS.includes(field.toLowerCase()) || field === '*') {
        valid.push(field);
      } else {
        invalid.push(field);
      }
    }

    return { valid, invalid };
  }

  /**
   * Get query complexity score (0-100)
   */
  public static getComplexityScore(commands: ParsedCommand[]): number {
    let score = 0;
    
    for (const command of commands) {
      switch (command.type) {
        case 'search':
          score += 10;
          break;
        case 'stats':
          score += 25;
          break;
        case 'sort':
          score += 15;
          break;
        case 'limit':
        case 'head':
        case 'tail':
          score += 5;
          break;
        case 'top':
          score += 20;
          break;
        case 'where':
          score += 10;
          break;
        case 'eval':
          score += 30;
          break;
        case 'dedup':
          score += 20;
          break;
      }
    }

    return Math.min(score, 100);
  }
}

/**
 * Convenience function for quick transpilation
 */
export function transpileQuery(splQuery: string): TranspilerResult {
  return QueryTranspiler.transpile(splQuery);
}

/**
 * Validate SPL query syntax
 */
export function validateQuery(splQuery: string): { isValid: boolean; errors: string[] } {
  const result = QueryTranspiler.transpile(splQuery);
  return {
    isValid: result.isValid,
    errors: result.errors
  };
}