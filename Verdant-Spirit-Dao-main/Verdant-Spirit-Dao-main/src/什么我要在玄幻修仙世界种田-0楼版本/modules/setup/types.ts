export interface IChoiceOption {
  id: string;
  name: string;
  description: string;
}

export interface IPointOption extends IChoiceOption {
  extraPoints: number;
}

export interface IItem {
  id: string;
  name: string;
  description: string;
  points: number;
  价值: {
    基础价值: number;
    价值标签: string[];
  };
}

export interface ISystem extends IChoiceOption {
    points: number;
}

export interface ITrait extends IChoiceOption {}

export interface ISeason extends IChoiceOption {}
