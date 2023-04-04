import { Entity, PrimaryGeneratedColumn, Column, BaseEntity } from "typeorm"

@Entity()
export class GLP extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: string

  @Column({ type: 'float' })
  block!: number;

  @Column({ type: 'float' })
  timestamp!: number;

  @Column({ type: 'float' })
  glpAum!: number;

  @Column({ type: 'float' })
  glpTotalSupply!: number;

  @Column({ type: 'float' })
  glpPrice!: number;

  @Column({ type: 'float' })
  btcReserves!: number;

  @Column({ type: 'float' })
  ethReserves!: number;

  @Column({ type: 'float' })
  btcPrice!: number;

  @Column({ type: 'float' })
  ethPrice!: number;

  @Column({ type: 'float' })
  ethAumA!: number;

  @Column({ type: 'float' })
  btcAumA!: number;

  @Column({ type: 'float' })
  ethAumB!: number;

  @Column({ type: 'float' })
  btcAumB!: number;

  @Column({ type: 'float' })
  ethAumC!: number;

  @Column({ type: 'float' })
  btcAumC!: number;

  @Column({ type: 'float' })
  btcUtilisation!: number;

  @Column({ type: 'float' })
  ethUtilisation!: number;

  @Column({ type: 'float' })
  cumulativeRewardPerToken!: number;

  @Column({ type: 'float' })
  gmxPrice!: number;
}

