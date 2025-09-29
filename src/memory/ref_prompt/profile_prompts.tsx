export const profile_prompts = {    
    "rebuild_base": {
        "type": "rebuild",
        "name":"更新+自动修复（推荐）",
        "system_prompt": `忘掉前面所有的要求，现在你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
        "user_prompt_begin": `请你根据<整理规则>和<聊天记录>处理<当前表格>，并严格按照<当前表格>的格式回复我<新的表格>，回复务必使用中文，只回复<新的表格>的内容，不要回复多余的解释和思考：`,
        "include_history": true,
        "include_last_table": true,
        "core_rules":`<整理规则>
{
  "TableProcessingProtocol": {
    "LanguageSpecification": {
      "OutputLanguage": "Chinese",
      "FormatRequirements": {
        "ProhibitedContent": ["comments", "redundant Markdown markup"]
      }
    },
    "StructuralProtection": {
      "TableFrameworkPolicy": {
        "ProhibitedOperations": ["column addition/deletion", "header modification"],
        "AllowedOperations": ["row insertion", "cell update"]
      }
    },
    "ProcessingWorkflow": ["Supplement", "Simplify", "Correct"],

    "Supplement": {
      "NewRowRules": {
        "ApplicableScope": "all tables except 时空表格",
        "TriggerCondition": "existence of unrecorded valid events",
        "InsertionLimitation": "batch insertion permitted"
      },
      "CellCompletionRules": {
        "InformationSourceRestriction": "explicitly mentioned in chat logs only",
        "NullValueHandling": "prohibit speculative content"
      }
    },

    "Simplify": {
      "TextCompressionRules": {
        "ActivationCondition": "cell character count >20",
        "ProcessingMethods": ["remove redundant terms", "merge synonymous items"],
        "ProhibitedActions": ["omit core facts", "alter data semantics"]
      }
    },

    "Correct": {
      "FormatStandardization": {
        "DelimiterStandard": "/",
        "StringSpecification": {
          "ForbiddenCharacters": ["double quotes"],
          "EscapeHandling": "direct removal"
        }
      },
    "ContentCheck": {
        "General Rule": {
            "Processing Steps": [
                "1. Split cell content by '/' into individual elements",
                "2. For each element:",
                "   a. Check against current column's exclusion list",
                "   b. If element contains excluded attributes:",
                "      i. Identify target column in same row that allows this attribute",
                "      ii. Move element to identified target column",
                "      iii. Remove from original column",
                "3. Rejoin elements with '/' in both original and target columns"
            ],
            "Validation Criteria": "All elements should strictly match the permitted attributes defined in their column"
        },
        "Example_Column Rules": {
            "Personality": {"Excluded Attributes": ["attitudes", "emotions", "thoughts"]},
            "Character Information": {"Excluded Attributes": ["attitudes", "personality", "thoughts"]},
            "Attitude": {"Excluded Attributes": ["personality", "status"]}
        }
    },
      "ContentUnificationRules": {
        "FormatInheritanceStrategy": {
          "TimeFormat": "inherit dominant format from existing table",
          "LocationFormat": "maintain existing hierarchical structure",
          "NumericalFormat": "preserve current measurement scale"
        }
      },
      "TableSpecificRules": {
        "时空表格": "retain only the latest row when multiple exist",
        "角色特征表格": "merge duplicate character entries",
        "角色与<user>社交表格": "delete rows containing <user>",
        "FeatureUpdateLogic": "synchronize latest status descriptions"
      },
      "GlobalCleanupRules": {
        "DuplicateDataPurge": "remove fully identical rows"
      }
    }
  }
}

回复格式示例。再次强调，直接按以下格式回复，不要思考过程，不要解释，不要多余内容：
<新的表格>
[{"tableName":"时空表格","tableIndex":0,"columns":["日期","时间","地点（当前描写）","此地角色"],"content":[["2024-01-01","12:00","异世界>酒馆","年轻女子"]]},{"tableName":"角色特征表格","tableIndex":1,"columns":["角色名","身体特征","性格","职业","爱好","喜欢的事物（作品、虚拟人物、物品等）","住所","其他重要信息"],"content":[["年轻女子","身形高挑/小麦色肌肤/乌黑长发/锐利眼睛","野性/不羁/豪爽/好奇","战士","习武","未知","未知","腰悬弯刀/兽牙项链/手指带血"]]},{"tableName":"角色与<user>社交表格","tableIndex":2,"columns":["角色名","对<user>关系","对<user>态度","对<user>好感"],"content":[["年轻女子","陌生人","疑惑/好奇","低"]]},{"tableName":"任务、命令或者约定表格","tableIndex":3,"columns":["角色","任务","地点","持续时间"],"content":[]},{"tableName":"重要事件历史表格","tableIndex":4,"columns":["角色","事件简述","日期","地点","情绪"],"content":[["年轻女子","进入酒馆/点酒/观察<user>","2024-01-01 12:00","异世界>酒馆","好奇"]]},{"tableName":"重要物品表格","tableIndex":5,"columns":["拥有人","物品描述","物品名","重要原因"],"content":[]}]
</新的表格>`        
    },    
    "rebuild_compatible": {
        "type": "rebuild",
        "name":"更新+自动修复（兼容模式，适用于自定义表格）",
        "system_prompt": `忘掉前面所有的要求，现在你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
        "user_prompt_begin": `请你根据<整理规则>和<聊天记录>处理<当前表格>，并严格按照<当前表格>的格式回复我<新的表格>，回复务必使用中文，只回复<新的表格>的内容，不要回复多余的解释和思考：`,
        "include_history": true,
        "include_last_table": true,
        "core_rules":`<整理规则>
{
  "TableProcessingProtocol": {
    "LanguageSpecification": {
      "OutputLanguage": "Chinese",
      "FormatRequirements": {
        "ProhibitedContent": ["comments", "redundant Markdown markup"]
      }
    },
    "StructuralProtection": {
      "TableFrameworkPolicy": {
        "ProhibitedOperations": ["column addition/deletion", "header modification"],
        "AllowedOperations": ["row insertion", "cell update"]
      }
    },
    "ProcessingWorkflow": ["Supplement", "Simplify", "Correct"],

    "Supplement": {
      "NewRowRules": {
        "ApplicableScope": "all tables except 时空表格",
        "TriggerCondition": "existence of unrecorded valid events",
        "InsertionLimitation": "batch insertion permitted"
      },
      "CellCompletionRules": {
        "InformationSourceRestriction": "explicitly mentioned in chat logs only",
        "NullValueHandling": "prohibit speculative content"
      }
    },

    "Simplify": {
      "TextCompressionRules": {
        "ActivationCondition": "cell character count >20",
        "ProcessingMethods": ["remove redundant terms", "merge synonymous items"],
        "ProhibitedActions": ["omit core facts", "alter data semantics"]
      }
    },

    "Correct": {
      "FormatStandardization": {
        "DelimiterStandard": "/",
        "StringSpecification": {
          "ForbiddenCharacters": ["double quotes"],
          "EscapeHandling": "direct removal"
        }
      },
    "ContentCheck": {
        "General Rule": {
            "Processing Steps": [
                "1. Split cell content by '/' into individual elements",
                "2. For each element:",
                "   a. Check against current column's exclusion list",
                "   b. If element contains excluded attributes:",
                "      i. Identify target column in same row that allows this attribute",
                "      ii. Move element to identified target column",
                "      iii. Remove from original column",
                "3. Rejoin elements with '/' in both original and target columns"
            ],
            "Validation Criteria": "All elements should strictly match the permitted attributes defined in their column"
        },
        "Example_Column Rules": {
            "Personality": {"Excluded Attributes": ["attitudes", "emotions", "thoughts"]},
            "Character Information": {"Excluded Attributes": ["attitudes", "personality", "thoughts"]},
            "Attitude": {"Excluded Attributes": ["personality", "status"]}
        }
    },
      "ContentUnificationRules": {
        "FormatInheritanceStrategy": {
          "TimeFormat": "inherit dominant format from existing table",
          "LocationFormat": "maintain existing hierarchical structure",
          "NumericalFormat": "preserve current measurement scale"
        }
      },
      "GlobalCleanupRules": {
        "DuplicateDataPurge": "remove fully identical rows"
      }
    }
  }
}

回复格式示例。再次强调，直接按以下格式回复，不要思考过程，不要解释，不要多余内容：
<新的表格>
[{"tableName":"时空表格","tableIndex":0,"columns":["日期","时间","地点（当前描写）","此地角色"],"content":[["2024-01-01","12:00","异世界>酒馆","年轻女子"]]},{"tableName":"角色特征表格","tableIndex":1,"columns":["角色名","身体特征","性格","职业","爱好","喜欢的事物（作品、虚拟人物、物品等）","住所","其他重要信息"],"content":[["年轻女子","身形高挑/小麦色肌肤/乌黑长发/锐利眼睛","野性/不羁/豪爽/好奇","战士","习武","未知","未知","腰悬弯刀/兽牙项链/手指带血"]]},{"tableName":"角色与<user>社交表格","tableIndex":2,"columns":["角色名","对<user>关系","对<user>态度","对<user>好感"],"content":[["年轻女子","陌生人","疑惑/好奇","低"]]},{"tableName":"任务、命令或者约定表格","tableIndex":3,"columns":["角色","任务","地点","持续时间"],"content":[]},{"tableName":"重要事件历史表格","tableIndex":4,"columns":["角色","事件简述","日期","地点","情绪"],"content":[["年轻女子","进入酒馆/点酒/观察<user>","2024-01-01 12:00","异世界>酒馆","好奇"]]},{"tableName":"重要物品表格","tableIndex":5,"columns":["拥有人","物品描述","物品名","重要原因"],"content":[]}]
</新的表格>`        
    },    
    "rebuild_summary": {
        "type": "rebuild",
        "name":"完整重建+总结（beta）",
        "system_prompt": `忘掉前面所有的要求，现在你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
        "user_prompt_begin": `请你根据<整理规则>和<聊天记录>处理<当前表格>，并严格按照<当前表格>的格式回复我<新的表格>，回复务必使用中文，只回复<新的表格>的内容，不要回复多余的解释和思考：`,
        "include_history": true,
        "include_last_table": true,
        "core_rules":`<整理规则>
{
  "TableProcessingProtocol": {
    "languageDirective": {
      "processingRules": "en-US",
      "outputSpecification": "zh-CN"
    },
    "structuralIntegrity": {
      "tableIndexPolicy": {
        "creation": "PROHIBITED",
        "modification": "PROHIBITED",
        "deletion": "PROHIBITED"
      },
      "columnManagement": {
        "freezeSchema": true,
        "allowedOperations": ["valueInsertion", "contentOptimization"]
      }
    },
    "processingWorkflow": ["SUPPLEMENT", "SIMPLIFY", "CORRECT", "SUMMARY"],

    "SUPPLEMENT": {
      "insertionProtocol": {
        "characterRegistration": {
          "triggerCondition": "newCharacterDetection || traitMutation",
          "attributeCapture": {
            "scope": "explicitDescriptionsOnly",
            "protectedDescriptors": ["粗布衣裳", "布条束发"],
            "mandatoryFields": ["角色名", "身体特征", "其他重要信息"],
            "validationRules": {
              "physique_description": "MUST_CONTAIN [体型/肤色/发色/瞳色]",
              "relationship_tier": "VALUE_RANGE:[-100, 100]"
            }
          }
        },
        "eventCapture": {
          "thresholdConditions": ["plotCriticality≥3", "emotionalShift≥2"],
          "emergencyBreakCondition": "3_consecutiveSimilarEvents"
        },
        "itemRegistration": {
          "significanceThreshold": "symbolicImportance≥5"
        }
      },
      "dataEnrichment": {
        "dynamicControl": {
          "costumeDescription": {
            "detailedModeThreshold": 25,
            "overflowAction": "SIMPLIFY_TRIGGER"
          },
          "eventDrivenUpdates": {
            "checkInterval": "EVERY_50_EVENTS",
            "monitoringDimensions": [
              "TIME_CONTRADICTIONS",
              "LOCATION_CONSISTENCY",
              "ITEM_TIMELINE",
              "CLOTHING_CHANGES"
            ],
            "updateStrategy": {
              "primaryMethod": "APPEND_WITH_MARKERS",
              "conflictResolution": "PRIORITIZE_CHRONOLOGICAL_ORDER"
            }
          },
          "formatCompatibility": {
            "timeFormatHandling": "ORIGINAL_PRESERVED_WITH_UTC_CONVERSION",
            "locationFormatStandard": "HIERARCHY_SEPARATOR(>)_WITH_GEOCODE",
            "errorCorrectionProtocols": {
              "dateOverflow": "AUTO_ADJUST_WITH_HISTORIC_PRESERVATION",
              "spatialConflict": "FLAG_AND_REMOVE_WITH_BACKUP"
            }
          }
        },
        "traitProtection": {
          "keyFeatures": ["heterochromia", "scarPatterns"],
          "lockCondition": "keywordMatch≥2"
        }
      }
    },

    "SIMPLIFY": {
      "compressionLogic": {
        "characterDescriptors": {
          "activationCondition": "wordCount>25 PerCell && !protectedStatus",
          "optimizationStrategy": {
            "baseRule": "material + color + style",
            "prohibitedElements": ["stitchingDetails", "wearMethod"],
            "mergeExamples": ["深褐/浅褐眼睛 → 褐色眼睛"]
          }
        },
        "eventConsolidation": {
          "mergeDepth": 2,
          "mergeRestrictions": ["crossCharacter", "crossTimeline"],
          "keepCriterion": "LONGER_DESCRIPTION_WITH_KEY_DETAILS"
        }
      },
      "protectionMechanism": {
        "protectedContent": {
          "summaryMarkers": ["[TIER1]", "[MILESTONE]"],
          "criticalTraits": ["异色瞳", "皇室纹章"]
        }
      }
    },

    "CORRECT": {
        "ContentCheck": {
        "Personality": "Should not include attitudes/emotions/thoughts",
        "Character Information": "Should not include attitudes/personality/thoughts",
        "Attitude": "Should not include personality/status"
      },
      "validationMatrix": {
        "temporalConsistency": {
          "checkFrequency": "every10Events",
          "anomalyResolution": "purgeConflicts"
        },
        "columnValidation": {
          "checkConditions": [
            "NUMERICAL_IN_TEXT_COLUMN",
            "TEXT_IN_NUMERICAL_COLUMN",
            "MISPLACED_FEATURE_DESCRIPTION",
            "WRONG_TABLE_PLACEMENT"
          ],
          "correctionProtocol": {
            "autoRelocation": "MOVE_TO_CORRECT_COLUMN",
            "typeMismatchHandling": {
              "primaryAction": "CONVERT_OR_RELOCATE",
              "fallbackAction": "FLAG_AND_ISOLATE"
            },
            "preserveOriginalState": false
          }
        },
        "duplicationControl": {
          "characterWhitelist": ["Physical Characteristics", "Clothing Details"],
          "mergeProtocol": {
            "exactMatch": "purgeRedundant",
            "sceneConsistency": "actionChaining"
          }
        },
        "exceptionHandlers": {
          "invalidRelationshipTier": {
            "operation": "FORCE_NUMERICAL_WITH_LOGGING",
            "loggingDetails": {
              "originalData": "Record the original invalid relationship tier data",
              "conversionStepsAndResults": "The operation steps and results of forced conversion to numerical values",
              "timestamp": "Operation timestamp",
              "tableAndRowInfo": "Names of relevant tables and indexes of relevant data rows"
            }
          },
          "physiqueInfoConflict": {
            "operation": "TRANSFER_TO_other_info_WITH_MARKER",
            "markerDetails": {
              "conflictCause": "Mark the specific cause of the conflict",
              "originalPhysiqueInfo": "Original physique information content",
              "transferTimestamp": "Transfer operation timestamp"
            }
          }
        }
      }
    },

    "SUMMARY": {
      "hierarchicalSystem": {
        "primaryCompression": {
          "triggerCondition": "10_rawEvents && unlockStatus",
          "generationTemplate": "[角色]在[时间段]通过[动作链]展现[特征]",
          "outputConstraints": {
            "maxLength": 200,
            "lockAfterGeneration": true,
            "placement": "重要事件历史表格",
            "columns": {
              "角色": "相关角色",
              "事件简述": "总结内容",
              "日期": "相关日期",
              "地点": "相关地点",
              "情绪": "相关情绪"
            }
          }
        },
        "advancedSynthesis": {
          "triggerCondition": "3_primarySummaries",
          "synthesisFocus": ["growthArc", "worldRulesManifestation"],
          "outputConstraints": {
            "placement": "重要事件历史表格",
            "columns": {
              "角色": "相关角色",
              "事件简述": "总结内容",
              "日期": "相关日期",
              "地点": "相关地点",
              "情绪": "相关情绪"
            }
          }
        }
      },
      "safetyOverrides": {
        "overcompensationGuard": {
          "detectionCriteria": "compressionArtifacts≥3",
          "recoveryProtocol": "rollback5Events"
        }
      }
    },

    "SystemSafeguards": {
      "priorityChannel": {
        "coreProcesses": ["deduplication", "traitPreservation"],
        "loadBalancing": {
          "timeoutThreshold": 15,
          "degradationProtocol": "basicValidationOnly"
        }
      },
      "paradoxResolution": {
        "temporalAnomalies": {
          "resolutionFlow": "freezeAndHighlight",
          "humanInterventionTag": "⚠️REQUIRES_ADMIN"
        }
      },
      "intelligentCleanupEngine": {
        "mandatoryPurgeRules": [
          "EXACT_DUPLICATES_WITH_TIMESTAMP_CHECK",
          "USER_ENTRIES_IN_SOCIAL_TABLE",
          "TIMELINE_VIOLATIONS_WITH_CASCADE_DELETION",
          "EMPTY_ROWS(excluding spacetime)",
          "EXPIRED_QUESTS(>20d)_WITH_ARCHIVAL"
        ],
        "protectionOverrides": {
          "protectedMarkers": ["[TIER1]", "[MILESTONE]"],
          "exemptionConditions": [
            "HAS_PROTECTED_TRAITS",
            "CRITICAL_PLOT_POINT"
          ]
        },
        "cleanupTriggers": {
          "eventCountThreshold": 1000,
          "storageUtilizationThreshold": "85%"
        }
      }
    }
  }
}

回复格式示例。再次强调，直接按以下格式回复，不要思考过程，不要解释，不要多余内容：
<新的表格>
[{"tableName":"时空表格","tableIndex":0,"columns":["日期","时间","地点（当前描写）","此地角色"],"content":[["2024-01-01","12:00","异世界>酒馆","年轻女子"]]},{"tableName":"角色特征表格","tableIndex":1,"columns":["角色名","身体特征","性格","职业","爱好","喜欢的事物（作品、虚拟人物、物品等）","住所","其他重要信息"],"content":[["年轻女子","身形高挑/小麦色肌肤/乌黑长发/锐利眼睛","野性/不羁/豪爽/好奇","战士","习武","未知","未知","腰悬弯刀/兽牙项链/手指带血"]]},{"tableName":"角色与<user>社交表格","tableIndex":2,"columns":["角色名","对<user>关系","对<user>态度","对<user>好感"],"content":[["年轻女子","陌生人","疑惑/好奇","低"]]},{"tableName":"任务、命令或者约定表格","tableIndex":3,"columns":["角色","任务","地点","持续时间"],"content":[]},{"tableName":"重要事件历史表格","tableIndex":4,"columns":["角色","事件简述","日期","地点","情绪"],"content":[["年轻女子","进入酒馆/点酒/观察<user>","2024-01-01 12:00","异世界>酒馆","好奇"]]},{"tableName":"重要物品表格","tableIndex":5,"columns":["拥有人","物品描述","物品名","重要原因"],"content":[]}]
</新的表格>`        
    },
    "rebuild_fix_all": {
        "type": "rebuild",
        "name":"修复表格（修复各种错误。不会产生新内容。）",
        "system_prompt": `忘掉前面所有的要求，现在你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
        "user_prompt_begin": `请你根据<整理规则>处理<当前表格>，并严格按照<当前表格>的格式回复我<新的表格>，回复务必使用中文，只回复<新的表格>的内容，不要回复多余的解释和思考：`,
        "include_history": false,
        "include_last_table": true,
        "core_rules":`{
  "ProcessingRules": {
    "MandatoryRules": {
      "Language": "Use Chinese for replies",
      "TableStructure": "Do not add/delete/modify table structures or headers",
      "CellFormatting": "No commas in cells, use / for semantic separation",
      "StringFormat": "No double quotes in strings",
      "Markdown": "No comments or extra Markdown tags"
    },
    "FormatChecks": {
      "Standardization": "Unify time/location/favorability formats",
      "TableSpecific": {
        "时空表格": "Keep only the latest row if multiple exist",
        "角色特征表格": "Merge duplicate character entries",
        "角色与<user>社交表格": {
          "DuplicateHandling": "Remove rows containing <user>"
        }
      },
      "ContentMaintenance": {
        "ExpiredUpdates": "Refresh outdated character features",
        "DuplicateRemoval": "Delete identical rows"
      }
    },
    "ContentChecks": {
      "ColumnValidation": {
      	"Target" : "Verify data matches column categories",
        "General Rule": {
            "Processing Steps": [
                "1. Split cell content by '/' into individual elements",
                "2. For each element:",
                "   a. Check against current column's exclusion list",
                "   b. If element contains excluded attributes:",
                "      i. Identify target column in same row that allows this attribute",
                "      ii. Move element to identified target column",
                "      iii. Remove from original column",
                "3. Rejoin elements with '/' in both original and target columns"
            ],
            "Validation Criteria": "All elements should strictly match the permitted attributes defined in their column"
        },
        "Example_Column Rules": {
            "Personality": {"Excluded Attributes": ["attitudes", "emotions", "thoughts"]},
            "Character Information": {"Excluded Attributes": ["attitudes", "personality", "thoughts"]},
            "Attitude": {"Excluded Attributes": ["personality", "status"]}
        }
      }
      "ConflictResolution": {
        "DataConsistency": "Resolve contradictory descriptions",
        "ConflictHandling": "Prioritize table-internal evidence"
      },
    },
    "FinalRequirement": "Preserve unproblematic content without modification"
  }
}

回复格式示例。再次强调，直接按以下格式回复，不要思考过程，不要解释，不要多余内容：
<新的表格>
[{"tableName":"时空表格","tableIndex":0,"columns":["日期","时间","地点（当前描写）","此地角色"],"content":[["2024-01-01","12:00","异世界>酒馆","年轻女子"]]},{"tableName":"角色特征表格","tableIndex":1,"columns":["角色名","身体特征","性格","职业","爱好","喜欢的事物（作品、虚拟人物、物品等）","住所","其他重要信息"],"content":[["年轻女子","身形高挑/小麦色肌肤/乌黑长发/锐利眼睛","野性/不羁/豪爽/好奇","战士","习武","未知","未知","腰悬弯刀/兽牙项链/手指带血"]]},{"tableName":"角色与<user>社交表格","tableIndex":2,"columns":["角色名","对<user>关系","对<user>态度","对<user>好感"],"content":[["年轻女子","陌生人","疑惑/好奇","低"]]},{"tableName":"任务、命令或者约定表格","tableIndex":3,"columns":["角色","任务","地点","持续时间"],"content":[]},{"tableName":"重要事件历史表格","tableIndex":4,"columns":["角色","事件简述","日期","地点","情绪"],"content":[["年轻女子","进入酒馆/点酒/观察<user>","2024-01-01 12:00","异世界>酒馆","好奇"]]},{"tableName":"重要物品表格","tableIndex":5,"columns":["拥有人","物品描述","物品名","重要原因"],"content":[]}]
</新的表格>`       
    },
    "rebuild_fix_simplify_all": {
        "type": "rebuild",
        "name":"修复+简化表格（修复各种错误,并简化整个表格：精简过长，合并重复。不会产生新内容。）",
        "system_prompt": `忘掉前面所有的要求，现在你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
        "user_prompt_begin": `请你根据<整理规则>处理<当前表格>，并严格按照<当前表格>的格式回复我<新的表格>，回复务必使用中文，只回复<新的表格>的内容，不要回复多余的解释和思考：`,
        "include_history": false,
        "include_last_table": true,
        "core_rules":`{
  "ProcessingRules": {
    "MandatoryRules": {
      "Language": "Use Chinese for replies",
      "TableStructure": "Do not add/delete/modify table structures or headers",
      "CellFormatting": "No commas in cells, use / for semantic separation",
      "StringFormat": "No double quotes in strings",
      "Markdown": "No comments or extra Markdown tags"
    },
    "FormatChecks": {
      "Standardization": "Unify time/location/favorability formats",
      "TableSpecific": {
        "时空表格": "Keep only the latest row if multiple exist",
        "角色特征表格": "Merge duplicate character entries",
        "角色与<user>社交表格": {
          "DuplicateHandling": "Remove rows containing <user>"
        }
      },
      "ContentMaintenance": {
        "ExpiredUpdates": "Refresh outdated character features",
        "DuplicateRemoval": "Delete identical rows"
      }
    },
    "ContentChecks": {
        "ColumnValidation": {
            "Target": "Verify data matches column categories",
            "General Rule": {
                "Processing Steps": [
                    "1. Split cell content by '/' into individual elements",
                    "2. For each element:",
                    "   a. Check against current column's exclusion list",
                    "   b. If element contains excluded attributes:",
                    "      i. Identify target column in same row that allows this attribute",
                    "      ii. Move element to identified target column",
                    "      iii. Remove from original column",
                    "3. Rejoin elements with '/' in both original and target columns"
                ],
                "Validation Criteria": "All elements should strictly match the permitted attributes defined in their column"
            },
            "Example_Column Rules": {
                "Personality": {"Excluded Attributes": ["attitudes", "emotions", "thoughts"]},
                "Character Information": {"Excluded Attributes": ["attitudes", "personality", "thoughts"]},
                "Attitude": {"Excluded Attributes": ["personality", "status"]}
            }
        },
        "ConflictResolution": {
            "DataConsistency": "Resolve contradictory descriptions",
            "ConflictHandling": "Prioritize table-internal evidence"
        },
        "SimplificationCheck": {
            "Check cells exceeding 15 characters": "Simplify content to under 15 characters if possible"
        },
        "重要事件历史表格简化": {
            "Step1": "Merge consecutive similar events into single rows",
            "Step2": "Summarize sequentially related events into consolidated rows"
        },
    },
    "FinalRequirement": "Preserve unproblematic content without modification"
  }
}

回复格式示例。再次强调，直接按以下格式回复，不要思考过程，不要解释，不要多余内容：
<新的表格>
[{"tableName":"时空表格","tableIndex":0,"columns":["日期","时间","地点（当前描写）","此地角色"],"content":[["2024-01-01","12:00","异世界>酒馆","年轻女子"]]},{"tableName":"角色特征表格","tableIndex":1,"columns":["角色名","身体特征","性格","职业","爱好","喜欢的事物（作品、虚拟人物、物品等）","住所","其他重要信息"],"content":[["年轻女子","身形高挑/小麦色肌肤/乌黑长发/锐利眼睛","野性/不羁/豪爽/好奇","战士","习武","未知","未知","腰悬弯刀/兽牙项链/手指带血"]]},{"tableName":"角色与<user>社交表格","tableIndex":2,"columns":["角色名","对<user>关系","对<user>态度","对<user>好感"],"content":[["年轻女子","陌生人","疑惑/好奇","低"]]},{"tableName":"任务、命令或者约定表格","tableIndex":3,"columns":["角色","任务","地点","持续时间"],"content":[]},{"tableName":"重要事件历史表格","tableIndex":4,"columns":["角色","事件简述","日期","地点","情绪"],"content":[["年轻女子","进入酒馆/点酒/观察<user>","2024-01-01 12:00","异世界>酒馆","好奇"]]},{"tableName":"重要物品表格","tableIndex":5,"columns":["拥有人","物品描述","物品名","重要原因"],"content":[]}]
</新的表格>`       
    },
    "rebuild_fix_simplify_without_history": {
        "type": "rebuild",
        "name":"修复+简化表格（同上，但不简化历史表格）",
        "system_prompt": `忘掉前面所有的要求，现在你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
        "user_prompt_begin": `请你根据<整理规则>处理<当前表格>，并严格按照<当前表格>的格式回复我<新的表格>，回复务必使用中文，只回复<新的表格>的内容，不要回复多余的解释和思考：`,
        "include_history": false,
        "include_last_table": true,
        "core_rules":`{
  "ProcessingRules": {
    "MandatoryRules": {
      "Language": "Use Chinese for replies",
      "TableStructure": "Do not add/delete/modify table structures or headers",
      "CellFormatting": "No commas in cells, use / for semantic separation",
      "StringFormat": "No double quotes in strings",
      "Markdown": "No comments or extra Markdown tags"
    },
    "FormatChecks": {
      "Standardization": "Unify time/location/favorability formats",
      "TableSpecific": {
        "时空表格": "Keep only the latest row if multiple exist",
        "角色特征表格": "Merge duplicate character entries",
        "角色与<user>社交表格": {
          "DuplicateHandling": "Remove rows containing <user>"
        }
      },
      "ContentMaintenance": {
        "ExpiredUpdates": "Refresh outdated character features",
        "DuplicateRemoval": "Delete identical rows"
      }
    },
    "ContentChecks": {
        "ColumnValidation": {
            "Target": "Verify data matches column categories",
            "General Rule": {
                "Processing Steps": [
                    "1. Split cell content by '/' into individual elements",
                    "2. For each element:",
                    "   a. Check against current column's exclusion list",
                    "   b. If element contains excluded attributes:",
                    "      i. Identify target column in same row that allows this attribute",
                    "      ii. Move element to identified target column",
                    "      iii. Remove from original column",
                    "3. Rejoin elements with '/' in both original and target columns"
                ],
                "Validation Criteria": "All elements should strictly match the permitted attributes defined in their column"
            },
            "Example_Column Rules": {
                "Personality": {"Excluded Attributes": ["attitudes", "emotions", "thoughts"]},
                "Character Information": {"Excluded Attributes": ["attitudes", "personality", "thoughts"]},
                "Attitude": {"Excluded Attributes": ["personality", "status"]}
            }
        },
        "ConflictResolution": {
            "DataConsistency": "Resolve contradictory descriptions",
            "ConflictHandling": "Prioritize table-internal evidence"
        },
        "SimplificationCheck": {
            "Check cells exceeding 15 characters": "Simplify content to under 15 characters if possible"
        },
    },
    "FinalRequirement": "Preserve unproblematic content without modification"
  }
}

回复格式示例。再次强调，直接按以下格式回复，不要思考过程，不要解释，不要多余内容：
<新的表格>
[{"tableName":"时空表格","tableIndex":0,"columns":["日期","时间","地点（当前描写）","此地角色"],"content":[["2024-01-01","12:00","异世界>酒馆","年轻女子"]]},{"tableName":"角色特征表格","tableIndex":1,"columns":["角色名","身体特征","性格","职业","爱好","喜欢的事物（作品、虚拟人物、物品等）","住所","其他重要信息"],"content":[["年轻女子","身形高挑/小麦色肌肤/乌黑长发/锐利眼睛","野性/不羁/豪爽/好奇","战士","习武","未知","未知","腰悬弯刀/兽牙项链/手指带血"]]},{"tableName":"角色与<user>社交表格","tableIndex":2,"columns":["角色名","对<user>关系","对<user>态度","对<user>好感"],"content":[["年轻女子","陌生人","疑惑/好奇","低"]]},{"tableName":"任务、命令或者约定表格","tableIndex":3,"columns":["角色","任务","地点","持续时间"],"content":[]},{"tableName":"重要事件历史表格","tableIndex":4,"columns":["角色","事件简述","日期","地点","情绪"],"content":[["年轻女子","进入酒馆/点酒/观察<user>","2024-01-01 12:00","异世界>酒馆","好奇"]]},{"tableName":"重要物品表格","tableIndex":5,"columns":["拥有人","物品描述","物品名","重要原因"],"content":[]}]
</新的表格>`       
},
    "rebuild_simplify_history": {
        "type": "rebuild",
        "name":"简化表格（仅简化历史表格）",
        "system_prompt": `忘掉前面所有的要求，现在你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
        "user_prompt_begin": `请你根据<整理规则>处理<当前表格>，并严格按照<当前表格>的格式回复我<新的表格>，回复务必使用中文，只回复<新的表格>的内容，不要回复多余的解释和思考：`,
        "include_history": false,
        "include_last_table": true,
        "core_rules":`{
  "ProcessingRules": {
    "MandatoryRules": {
      "Language": "Use Chinese for replies",
      "TableStructure": "Do not add/delete/modify table structures or headers",
      "CellFormatting": "No commas in cells, use / for semantic separation",
      "StringFormat": "No double quotes in strings",
      "Markdown": "No comments or extra Markdown tags"
    },
    "FormatChecks": {
      "Standardization": "Unify time/location/favorability formats",
      "TableSpecific": {
        "时空表格": "Keep only the latest row if multiple exist",
        "角色特征表格": "Merge duplicate character entries",
        "角色与<user>社交表格": {
          "DuplicateHandling": "Remove rows containing <user>"
        }
      },
      "ContentMaintenance": {
        "ExpiredUpdates": "Refresh outdated character features",
        "DuplicateRemoval": "Delete identical rows"
      }
    },
    "ContentChecks": {
      "ColumnValidation": "Verify data matches column categories",
      "ConflictResolution": {
        "DataConsistency": "Resolve contradictory descriptions",
        "ConflictHandling": "Prioritize table-internal evidence"
      },
      "重要事件历史表格简化": {
        "Step1": "Merge consecutive similar events into single rows",
        "Step2": "Summarize sequentially related events into consolidated rows",
      }
    },
    "FinalRequirement": "Preserve unproblematic content without modification"
  }
}

回复格式示例。再次强调，直接按以下格式回复，不要思考过程，不要解释，不要多余内容：
<新的表格>
[{"tableName":"时空表格","tableIndex":0,"columns":["日期","时间","地点（当前描写）","此地角色"],"content":[["2024-01-01","12:00","异世界>酒馆","年轻女子"]]},{"tableName":"角色特征表格","tableIndex":1,"columns":["角色名","身体特征","性格","职业","爱好","喜欢的事物（作品、虚拟人物、物品等）","住所","其他重要信息"],"content":[["年轻女子","身形高挑/小麦色肌肤/乌黑长发/锐利眼睛","野性/不羁/豪爽/好奇","战士","习武","未知","未知","腰悬弯刀/兽牙项链/手指带血"]]},{"tableName":"角色与<user>社交表格","tableIndex":2,"columns":["角色名","对<user>关系","对<user>态度","对<user>好感"],"content":[["年轻女子","陌生人","疑惑/好奇","低"]]},{"tableName":"任务、命令或者约定表格","tableIndex":3,"columns":["角色","任务","地点","持续时间"],"content":[]},{"tableName":"重要事件历史表格","tableIndex":4,"columns":["角色","事件简述","日期","地点","情绪"],"content":[["年轻女子","进入酒馆/点酒/观察<user>","2024-01-01 12:00","异世界>酒馆","好奇"]]},{"tableName":"重要物品表格","tableIndex":5,"columns":["拥有人","物品描述","物品名","重要原因"],"content":[]}]
</新的表格>`       
    },
    "refresh_table_old": {
        "type": "refresh",
        "name":"整理表格",
        "system_prompt": `忘掉前面所有的要求，现在你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
        "user_prompt_begin": `根据以下规则整理表格：
<整理规则>
    1. 修正格式错误，删除所有data[0]为空的行，此操作只允许整行操作！
    2. 补全空白/未知内容，但禁止捏造信息
    3. 当"重要事件历史表格"(tableIndex: 4)超过10行时，检查是否有重复或内容相近的行，适当合并或删除多余的行，此操作只允许整行操作！
    4. "角色与User社交表格"(tableIndex: 2)中角色名禁止重复，有重复的需要整行删除，此操作只允许整行操作！
    5. "时空表格"(tableIndex: 0）只允许有一行，删除所有旧的内容，此操作只允许整行操作！
    6. 如果一个格子中超过15个字，则进行简化使之不超过15个字；如果一个格子中斜杠分隔的内容超过4个，则简化后只保留不超过4个
    7. 时间格式统一为YYYY-MM-DD HH：MM   (时间中的冒号应当用中文冒号，未知的部分可以省略，例如：2023-10-01 12：00 或 2023-10-01 或 12：00)
    8. 地点格式为 大陆>国家>城市>具体地点 (未知的部分可以省略，例如：大陆>中国>北京>故宫 或 异世界>酒馆)
    9. 单元格中禁止使用逗号，语义分割应使用 /
    10. 单元格内的string中禁止出现双引号
    11. 禁止插入与现有表格内容完全相同的行，检查现有表格数据后再决定是否插入
</整理规则>`,
        "include_history": true,
        "include_last_table": true,
        "core_rules":`
请用纯JSON格式回复操作列表，确保：
    1. 所有键名必须使用双引号包裹，例如 "action" 而非 action
    2. 数值键名必须加双引号，例如 "0" 而非 0
    3. 使用双引号而非单引号，例如 "value" 而非 'value'
    4. 斜杠（/）必须转义为 \/
    5. 不要包含注释或多余的Markdown标记
    6. 将所有删除操作放在最后发送，并且删除的时候先发送row值较大的操作
    7. 有效的格式：
        [{
            "action": "insert/update/delete",
            "tableIndex": 数字,
            "rowIndex": 数字（delete/update时需要）,
            "data": {列索引: "值"}（insert/update时需要）
        }]
    8. 强调：delete操作不包含"data"，insert操作不包含"rowIndex"
    9. 强调：tableIndex和rowIndex的值为数字，不加双引号，例如 0 而非 "0"

<正确回复示例>
    [
        {
            "action": "update",
            "tableIndex": 0,
            "rowIndex": 0,
            "data": {
            "0": "2023-10-01",
            "1": "12：00",
            "2": "大陆>中国>北京>故宫"
            }
        }，
        {
            "action": "insert",",
            "tableIndex": 0,
            "data": {
            "0": "2023-10-01",
            "1": "12：00",
            "2": "大陆>中国>北京>故宫"
            }
        },
        {
            "action": "delete",
            "tableIndex": 0,
            "rowIndex": 0,
        }
    ]
</正确格式示例>`       
    }
}
