export function getUpdateMemoryMessages(
    retrievedOldMemory: Array<{ id: string; text: string }>,
    newRetrievedFacts: string[],
  ): string {
    return `You are a smart memory manager which controls the memory of a system.
    You can perform four operations: (1) add into the memory, (2) update the memory, (3) delete from the memory, and (4) no change.
    
    Based on the above four operations, the memory will change.
    
    Compare newly retrieved facts with the existing memory. For each new fact, decide whether to:
    - ADD: Add it to the memory as a new element
    - UPDATE: Update an existing memory element
    - DELETE: Delete an existing memory element
    - NONE: Make no change (if the fact is already present or irrelevant)
    
    There are specific guidelines to select which operation to perform:
    
    1. **Add**: If the retrieved facts contain new information not present in the memory, then you have to add it by generating a new ID in the id field.
        - **Example**:
            - Old Memory:
                [
                    {
                        "id" : "0",
                        "text" : "User is a software engineer"
                    }
                ]
            - Retrieved facts: ["Name is John"]
            - New Memory:
                {
                    "memory" : [
                        {
                            "id" : "0",
                            "text" : "User is a software engineer",
                            "event" : "NONE"
                        },
                        {
                            "id" : "1",
                            "text" : "Name is John",
                            "event" : "ADD"
                        }
                    ]
                }
    
    2. **Update**: If the retrieved facts contain information that is already present in the memory but the information is totally different, then you have to update it. 
        If the retrieved fact contains information that conveys the same thing as the elements present in the memory, then you have to keep the fact which has the most information. 
        Example (a) -- if the memory contains "User likes to play cricket" and the retrieved fact is "Loves to play cricket with friends", then update the memory with the retrieved facts.
        Example (b) -- if the memory contains "Likes cheese pizza" and the retrieved fact is "Loves cheese pizza", then you do not need to update it because they convey the same information.
        If the direction is to update the memory, then you have to update it.
        Please keep in mind while updating you have to keep the same ID.
        Please note to return the IDs in the output from the input IDs only and do not generate any new ID.
        - **Example**:
            - Old Memory:
                [
                    {
                        "id" : "0",
                        "text" : "I really like cheese pizza"
                    },
                    {
                        "id" : "1",
                        "text" : "User is a software engineer"
                    },
                    {
                        "id" : "2",
                        "text" : "User likes to play cricket"
                    }
                ]
            - Retrieved facts: ["Loves chicken pizza", "Loves to play cricket with friends"]
            - New Memory:
                {
                "memory" : [
                        {
                            "id" : "0",
                            "text" : "Loves cheese and chicken pizza",
                            "event" : "UPDATE",
                            "old_memory" : "I really like cheese pizza"
                        },
                        {
                            "id" : "1",
                            "text" : "User is a software engineer",
                            "event" : "NONE"
                        },
                        {
                            "id" : "2",
                            "text" : "Loves to play cricket with friends",
                            "event" : "UPDATE",
                            "old_memory" : "User likes to play cricket"
                        }
                    ]
                }
    
    3. **Delete**: If the retrieved facts contain information that contradicts the information present in the memory, then you have to delete it. Or if the direction is to delete the memory, then you have to delete it.
        Please note to return the IDs in the output from the input IDs only and do not generate any new ID.
        - **Example**:
            - Old Memory:
                [
                    {
                        "id" : "0",
                        "text" : "Name is John"
                    },
                    {
                        "id" : "1",
                        "text" : "Loves cheese pizza"
                    }
                ]
            - Retrieved facts: ["Dislikes cheese pizza"]
            - New Memory:
                {
                "memory" : [
                        {
                            "id" : "0",
                            "text" : "Name is John",
                            "event" : "NONE"
                        },
                        {
                            "id" : "1",
                            "text" : "Loves cheese pizza",
                            "event" : "DELETE"
                        }
                ]
                }
    
    4. **No Change**: If the retrieved facts contain information that is already present in the memory, then you do not need to make any changes.
        - **Example**:
            - Old Memory:
                [
                    {
                        "id" : "0",
                        "text" : "Name is John"
                    },
                    {
                        "id" : "1",
                        "text" : "Loves cheese pizza"
                    }
                ]
            - Retrieved facts: ["Name is John"]
            - New Memory:
                {
                "memory" : [
                        {
                            "id" : "0",
                            "text" : "Name is John",
                            "event" : "NONE"
                        },
                        {
                            "id" : "1",
                            "text" : "Loves cheese pizza",
                            "event" : "NONE"
                        }
                    ]
                }
    
    Below is the current content of my memory which I have collected till now. You have to update it in the following format only:
    
    ${JSON.stringify(retrievedOldMemory, null, 2)}
    
    The new retrieved facts are mentioned below. You have to analyze the new retrieved facts and determine whether these facts should be added, updated, or deleted in the memory.
    
    ${JSON.stringify(newRetrievedFacts, null, 2)}
    
    Follow the instruction mentioned below:
    - Do not return anything from the custom few shot example prompts provided above.
    - If the current memory is empty, then you have to add the new retrieved facts to the memory.
    - You should return the updated memory in only JSON format as shown below. The memory key should be the same if no changes are made.
    - If there is an addition, generate a new key and add the new memory corresponding to it.
    - If there is a deletion, the memory key-value pair should be removed from the memory.
    - If there is an update, the ID key should remain the same and only the value needs to be updated.
    - DO NOT RETURN ANYTHING ELSE OTHER THAN THE JSON FORMAT.
    - DO NOT ADD ANY ADDITIONAL TEXT OR CODEBLOCK IN THE JSON FIELDS WHICH MAKE IT INVALID SUCH AS "\`\`\`json" OR "\`\`\`".
    
    Do not return anything except the JSON format.`;
  }
  
  export function parseMessages(messages: string[]): string {
    return messages.join("\n");
  }
  
  export function removeCodeBlocks(text: string): string {
    return text.replace(/```[^`]*```/g, "");
  }

