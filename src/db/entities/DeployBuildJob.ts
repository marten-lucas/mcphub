import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity({ name: 'deploy_build_jobs' })
@Index(['status'])
@Index(['repositoryUrl'])
@Index(['serverName'])
export class DeployBuildJob {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 1024, name: 'repository_url' })
  repositoryUrl: string;

  @Column({ type: 'varchar', length: 255, name: 'server_name' })
  serverName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  version?: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'timestamp', name: 'started_at', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
  completedAt?: Date;

  @Column({ type: 'text', name: 'install_root' })
  installRoot: string;

  @Column({ type: 'text', name: 'install_dir' })
  installDir: string;

  @Column({ type: 'varchar', length: 32 })
  engine: 'node' | 'python' | 'docker' | 'unknown';

  @Column({ type: 'simple-json' })
  plan: Record<string, unknown>;

  @Column({ type: 'int', name: 'process_pid', nullable: true })
  processPid?: number;

  @Column({ type: 'simple-json' })
  logs: string[];

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ type: 'int', name: 'selected_port', nullable: true })
  selectedPort?: number;
}

export default DeployBuildJob;
